import { NextResponse } from "next/server";
import { z } from "zod";
import { closeSession, currentUser, matchesPassword, openSession, passwordHash, token } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { categories } from "../../../lib/contracts";
import { validDay } from "../../../lib/dates";
import { Prisma } from "../../../generated/prisma/client";

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const profile = { id: true, name: true, role: true } as const;
const email = z.email().max(254);
const password = z.string().min(8).max(128);
const name = z.string().trim().min(1).max(45);
const body = z.string().trim().min(1).max(1000);
const id = z.string().min(1).max(100);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), email, password }),
  z.object({ action: z.literal("register"), email, password, name, invite: z.string().trim().min(1).max(80).optional() }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("invite") }),
  z.object({ action: z.literal("addTask"), title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000), category: z.enum(categories),
    day: z.string().refine(validDay), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    remindAt: z.iso.datetime().nullable() }),
  z.object({ action: z.literal("complete"), id, done: z.boolean() }),
  z.object({ action: z.literal("comment"), id, text: body }),
  z.object({ action: z.literal("message"), text: body }),
  z.object({ action: z.literal("read") }),
]);

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return fail("Войдите в аккаунт", 401);
  const day = new URL(request.url).searchParams.get("day");
  if (!day || !validDay(day)) return fail("Некорректная дата");
  const prisma = db();
  const { familyId, id: userId, role, name } = user;
  if (role === "CHILD") {
    const due = await prisma.task.findMany({
      where: { familyId, completedAt: null, remindAt: {
        gt: new Date(Date.now() - 86400000), lte: new Date(),
      } }, select: { id: true, title: true },
    });
    if (due.length) await prisma.notification.createMany({
      data: due.map(task => ({
        userId, key: "reminder:" + task.id, kind: "reminder", text: "Пора выполнить: " + task.title,
      })),
      skipDuplicates: true,
    });
  }
  const [family, tasks, messages, notifications, unread, completed] = await Promise.all([
    prisma.family.findUniqueOrThrow({ where: { id: familyId },
      select: { invite: true, users: { select: profile } } }),
    prisma.task.findMany({ where: { familyId, day }, orderBy: [{ time: "asc" }, { createdAt: "asc" }],
      include: { comments: { include: { author: { select: profile } }, orderBy: { createdAt: "asc" } } } }),
    prisma.message.findMany({ where: { familyId }, include: { author: { select: profile } },
      take: 100, orderBy: { createdAt: "desc" } }),
    prisma.notification.findMany({ where: { userId }, take: 50, orderBy: { createdAt: "desc" } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.task.count({ where: { familyId, completedAt: { not: null } } }),
  ]);
  return NextResponse.json({ user: { id: userId, name, role }, members: family.users,
    invite: role === "PARENT" ? family.invite : null,
    tasks, messages: messages.reverse(), notifications, unread, completed },
  { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== host)) return fail("Запрос отклонён", 403);
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Проверьте заполненные поля");
  const data = parsed.data;
  const prisma = db();
  try {
    if (data.action === "login") {
      const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
      if (!await matchesPassword(data.password, user?.password) || !user) return fail("Неверный email или пароль", 401);
      await openSession(user.id);
      return NextResponse.json({ ok: true });
    }
    if (data.action === "register") {
      const account = { name: data.name, email: data.email.toLowerCase(), password: await passwordHash(data.password) };
      const { invite } = data;
      const user = await prisma.$transaction(async tx => {
        if (!invite) {
          const family = await tx.family.create({ data: { invite: token() } });
          return tx.user.create({ data: { ...account, familyId: family.id, role: "PARENT" } });
        }
        const family = await tx.family.findUnique({ where: { invite } });
        if (!family) return null;
        const claimed = await tx.family.updateMany({ where: { id: family.id, invite }, data: { invite: null } });
        if (!claimed.count) return null;
        return tx.user.create({ data: { ...account, familyId: family.id, role: "CHILD" } });
      });
      if (!user) return fail("Приглашение недействительно или уже использовано");
      await openSession(user.id);
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    if (data.action === "logout") {
      await closeSession();
      return NextResponse.json({ ok: true });
    }
    const user = await currentUser();
    if (!user) return fail("Войдите в аккаунт", 401);
    const { familyId, id: userId, role, name } = user;

    switch (data.action) {
      case "invite":
        if (role !== "PARENT") return fail("Доступно родителю", 403);
        if (await prisma.user.count({ where: { familyId, role: "CHILD" } })) return fail("Ребёнок уже в экипаже");
        if (!(await prisma.family.updateMany({ where: { id: familyId, invite: { not: null } },
          data: { invite: token() } })).count) return fail("Приглашение уже использовано", 409);
        break;
      case "addTask":
        if (data.remindAt && !data.time) return fail("Укажите время напоминания");
        await prisma.task.create({ data: { familyId, title: data.title, description: data.description,
          category: data.category, day: data.day, time: data.time, remindAt: data.remindAt } });
        break;
      case "complete": {
        if (role !== "CHILD") return fail("Отметить выполнение может ребёнок", 403);
        const now = new Date();
        const exists = await prisma.$transaction(async tx => {
          const task = await tx.task.findFirst({ where: { id: data.id, familyId } });
          if (!task) return false;
          const changed = await tx.task.updateMany({ where: { id: task.id, familyId,
            completedAt: data.done ? null : { not: null } }, data: { completedAt: data.done ? now : null } });
          if (changed.count && data.done) {
            const parent = await tx.user.findUniqueOrThrow({ where: { familyId_role: { familyId, role: "PARENT" } } });
            const text = `${name} · выполнено «${task.title}»`;
            await tx.notification.upsert({ where: { userId_key: { userId: parent.id, key: task.id } },
              create: { userId: parent.id, key: task.id, kind: "complete", text },
              update: { text, readAt: null, createdAt: now } });
          }
          return true;
        });
        if (!exists) return fail("Дело не найдено", 404);
        break;
      }
      case "comment": {
        const task = await prisma.task.findFirst({ where: { id: data.id, familyId }, select: { id: true } });
        if (!task) return fail("Дело не найдено", 404);
        await prisma.comment.create({ data: { taskId: task.id, authorId: userId, text: data.text } });
        break;
      }
      case "message":
        await prisma.message.create({ data: { familyId, authorId: userId, text: data.text } });
        break;
      case "read":
        await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Аккаунт с этим email уже существует или приглашение использовано", 409);
    }
    console.error("Family action failed", data.action, error instanceof Error ? error.name : "UnknownError");
    return fail("Не удалось сохранить. Попробуйте ещё раз", 500);
  }
}
