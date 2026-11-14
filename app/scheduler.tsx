"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell, BellRing, BookOpen, Bot, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, Copy, House, LogOut, MessageCircle, Orbit, Plus, Rocket, Send,
  Settings2, Sparkles, Star, Trophy, Users, X,
} from "lucide-react";
import { categories, type Category, type FamilyState, type Task } from "../lib/contracts";
import { shiftDay } from "../lib/dates";

const categoryInfo = {
  SCHOOL: { label: "Учёба", icon: BookOpen },
  HOME: { label: "Дом", icon: House },
  PERSONAL: { label: "Для себя", icon: Sparkles },
};
const sections = [
  { key: "plan", title: "Планер", icon: CalendarDays },
  { key: "chat", title: "Семейный чат", icon: MessageCircle },
  { key: "awards", title: "Награды", icon: Trophy },
  { key: "settings", title: "Экипаж", icon: Users },
] as const;
type Section = typeof sections[number]["key"];
const milestones = [
  { stars: 10, title: "Первый запуск", detail: "Заверши первое дело", icon: Rocket },
  { stars: 50, title: "На орбите", detail: "Выполни 5 дел", icon: Orbit },
  { stars: 100, title: "Покоритель звёзд", detail: "Выполни 10 дел", icon: Trophy },
];
const longDate = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", timeZone: "UTC" });
const shortWeekday = new Intl.DateTimeFormat("ru", { weekday: "short", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("ru", { weekday: "long", timeZone: "UTC" });
const noon = (day: string) => new Date(day + "T12:00:00Z");
const capitalize = (value: string) => value.slice(0, 1).toUpperCase() + value.slice(1);
const clock = (value: string) => new Intl.DateTimeFormat("ru", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
}).format(new Date(value));
const todayLabel = (day: string, today: string) => day === today ? "Сегодня" : capitalize(weekday.format(noon(day)));
const demoUser = { id: "demo-child", name: "Саша", role: "CHILD" } as const;
const demoParent = { id: "demo-parent", name: "Мама", role: "PARENT" } as const;

function demo(day: string, today: string): FamilyState {
  const sample = (id: string, title: string, description: string, category: Category, time: string, done = false): Task => ({
    id, title, description, category, day, time, remindAt: null, comments: [],
    completedAt: done ? today + "T08:00:00Z" : null,
  });
  return {
    user: demoUser, members: [demoUser, demoParent], invite: null,
    tasks: day === today ? [
      sample("homework", "Решить задачи по математике", "Стр. 48, задания 3–5", "SCHOOL", "16:00"),
      sample("desk", "Навести порядок на столе", "Подготовить место для занятий", "HOME", "17:30"),
      sample("reading", "Почитать 20 минут", "Следующая глава любимой книги", "PERSONAL", "19:00"),
      sample("exercise", "Сделать зарядку", "Начать утро с разминки", "PERSONAL", "08:30", true),
    ] : [],
    messages: [{ id: "demo-message", author: demoParent, text: "Удачного дня, капитан! 🚀", createdAt: today + "T06:00:00Z" }],
    notifications: [], unread: 0, completed: 1,
  };
}

async function request(payload: Record<string, unknown>) {
  const response = await fetch("/api/family", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || "Сервис временно недоступен");
  return result;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="dialog-title">
    <div className="dialog-body">
      <div className="panel-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20}/></button></div>
      {children}
    </div>
  </dialog>;
}

export default function Scheduler({ today }: { today: string }) {
  const [day, setDay] = useState(today);
  const [section, setSection] = useState<Section>("plan");
  const [session, setSession] = useState<"loading" | "demo" | "live">("loading");
  const [data, setData] = useState<FamilyState>(() => demo(today, today));
  const [dataDay, setDataDay] = useState(today);
  const [modal, setModal] = useState<"auth" | "task" | "notices" | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "parent" | "child">("login");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const latestRequest = useRef(0);
  const datePicker = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (target: string) => {
    const version = ++latestRequest.current;
    const response = await fetch("/api/family?day=" + encodeURIComponent(target), { cache: "no-store" });
    if (version !== latestRequest.current) return;
    if (response.status === 401) {
      setSession("demo");
      setData(demo(target, today));
      setDataDay(target);
      return;
    }
    if (!response.ok) throw new Error("Не удалось обновить данные");
    const state: FamilyState = await response.json();
    if (version !== latestRequest.current) return;
    setData(state);
    setDataDay(target);
    setSession("live");
  }, [today]);

  useEffect(() => {
    refresh(day).catch(() => {
      setStatus("Сервис временно недоступен");
      setSession(value => value === "loading" ? "demo" : value);
    });
    const interval = window.setInterval(() => {
      if (session === "live") refresh(day).catch(() => setStatus("Не удалось обновить данные"));
    }, 8000);
    return () => window.clearInterval(interval);
  }, [day, refresh, session]);

  useEffect(() => {
    const code = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (code) {
      setInviteInput(code.slice(0, 80));
      setAuthMode("child");
      setModal("auth");
      history.replaceState(null, "", location.pathname + location.search);
    }
    setNotificationEnabled(typeof Notification !== "undefined" && Notification.permission === "granted");
  }, []);

  useEffect(() => {
    if (session !== "live" || !notificationEnabled) return;
    for (const notice of data.notifications.filter(item => !item.readAt)) {
      const key = "orbita-notice:" + notice.id;
      if (sessionStorage.getItem(key)) continue;
      try {
        new Notification("Орбита", { body: notice.text, tag: key });
      } catch {
        return;
      }
      sessionStorage.setItem(key, "1");
    }
  }, [data.notifications, notificationEnabled, session]);

  function open(next: typeof modal, mode = authMode) {
    setError("");
    setModal(next);
    setAuthMode(mode);
  }

  async function mutate(payload: Record<string, unknown>, after?: () => void, target = day) {
    if (pending) return;
    setError("");
    setStatus("");
    setPending(true);
    try {
      await request(payload);
      after?.();
      await refresh(target);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  function requireAccount(next: () => void) {
    if (session === "live") next();
    else open("auth", "parent");
  }

  function changeDay(next: string) {
    if (!next) return;
    setDay(next);
    setFilter("all");
    setSelectedTask(null);
  }

  function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = { email: form.get("email"), password: form.get("password") };
    void mutate(authMode === "login" ? { action: "login", ...fields } : {
      action: "register", ...fields, name: form.get("name"), invite: authMode === "child" ? form.get("invite") : undefined,
    }, () => open(null));
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const taskDay = String(form.get("day"));
    const time = String(form.get("time")) || null;
    const remindAt = form.get("remind") && time ? new Date(`${taskDay}T${time}:00+03:00`).toISOString() : null;
    if (form.get("remind") && !time) { setError("Укажите время напоминания"); return; }
    void mutate({ action: "addTask", title: form.get("title"), description: form.get("description"),
      category: form.get("category"), day: taskDay, time, remindAt }, () => { changeDay(taskDay); open(null); }, taskDay);
  }

  function submitNote(event: FormEvent<HTMLFormElement>, action: "comment" | "message", id?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = new FormData(form).get("text");
    requireAccount(() => void mutate({ action, id, text }, () => form.reset()));
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setStatus("Скопировано"); }
    catch { setStatus("Выделите и скопируйте значение вручную"); }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") { setStatus("Уведомления браузера недоступны"); return; }
    const permission = await Notification.requestPermission();
    setNotificationEnabled(permission === "granted");
    setStatus(permission === "granted" ? "Уведомления включены" : "Разрешите уведомления в настройках браузера");
  }

  const tasks = dataDay === day ? data.tasks : [];
  const done = tasks.filter(task => task.completedAt).length;
  const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const stars = data.completed * 10;
  const visibleTasks = tasks.filter(task => filter === "all" || Boolean(task.completedAt) === (filter === "done"));
  const detail = tasks.find(task => task.id === selectedTask);
  const weekStart = shiftDay(day, -((noon(day).getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(weekStart, i));
  const parent = data.user.role === "PARENT";
  const title = sections.find(item => item.key === section)?.title;
  const panelError = !modal && !detail && error;

  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" aria-label="Орбита, открыть планер" onClick={() => setSection("plan")}><Orbit size={23}/><strong>Орбита</strong></button>
      <div className="sidebar-content">
        <nav aria-label="Разделы приложения">{sections.map(({ key, title, icon: Icon }) =>
          <button key={key} className={section === key ? "nav-link active" : "nav-link"} aria-current={section === key ? "page" : undefined}
            onClick={() => { setSection(key); setError(""); }}><Icon size={19}/><span>{title}</span></button>)}</nav>
      </div>
      <div className="sidebar-bottom">
        {session === "live" &&
          <button className="nav-link" onClick={() => void mutate({ action: "logout" })}><LogOut size={18}/> Выйти</button>}
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="top-title"><span>{title}</span>{session === "demo" && <small>Демо</small>}</div>
        <div className="toolbar">
          <button className="star-count" onClick={() => setSection("awards")} aria-label={`Награды: ${stars} звёзд`}><Star size={17} fill="currentColor"/>{stars}</button>
          <button className="icon-button notice-button" aria-label={`Уведомления: ${data.unread} новых`} onClick={() => open("notices")}><Bell size={19}/>{data.unread > 0 && <i/>}</button>
          {session === "live" ? <button className="avatar" aria-label="Экипаж" onClick={() => setSection("settings")}>{data.user.name.slice(0, 1).toUpperCase()}</button> :
            <button className="button" onClick={() => open("auth", "login")}>Войти</button>}
        </div>
      </header>
      <main>
        {panelError && <p className="feedback error" role="alert">{panelError}</p>}
        {status && <p className="feedback status" role="status" onClick={() => setStatus("")}>{status}</p>}
        {section === "plan" ? <div className="dashboard">
          <div className="primary-column">
            <section className="schedule" aria-labelledby="schedule-title">
              <div className="panel-heading"><div><h1 id="schedule-title">Расписание</h1><p>{todayLabel(day, today)}, {longDate.format(noon(day))}</p></div>
                <div className="calendar-tools">
                  <button className="icon-button" aria-label="Предыдущая неделя" onClick={() => changeDay(shiftDay(day, -7))}><ChevronLeft size={17}/></button>
                  <div className="date-picker"><button className="icon-button" aria-label="Выбрать дату" onClick={() => {
                    try { datePicker.current?.showPicker(); } catch { datePicker.current?.focus(); }
                  }}><CalendarDays size={17}/></button><input ref={datePicker} type="date" value={day} aria-label="Дата расписания" onChange={event => changeDay(event.target.value)}/></div>
                  <button className="icon-button" aria-label="Следующая неделя" onClick={() => changeDay(shiftDay(day, 7))}><ChevronRight size={17}/></button>
                </div>
              </div>
              <div className="week">{days.map(date => <button key={date} className={date === day ? "day selected" : "day"}
                aria-pressed={date === day} onClick={() => changeDay(date)}>
                <span>{shortWeekday.format(noon(date))}</span><strong>{noon(date).getUTCDate()}</strong><i className={date === today ? "today-dot" : ""}/>
              </button>)}</div>
              <div className="list-tools">
                <div className="filters" aria-label="Фильтр дел">{([["all", "Все дела"], ["open", "В работе"], ["done", "Готово"]] as const).map(([key, label]) =>
                  <button className={filter === key ? "selected" : ""} key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
                <button className="button primary add-task" onClick={() => requireAccount(() => open("task"))}><Plus size={16}/> Новое дело</button>
              </div>
              <div className="task-list">
                {visibleTasks.map(task => {
                  const { label, icon: Icon } = categoryInfo[task.category];
                  return <article className={task.completedAt ? "task done" : "task"} key={task.id}>
                    <button className="task-check" disabled={session === "live" && (parent || pending)}
                      aria-label={task.completedAt ? "Вернуть дело в работу" : "Отметить дело выполненным"} aria-pressed={!!task.completedAt}
                      onClick={() => {
                        if (session === "live") { void mutate({ action: "complete", id: task.id, done: !task.completedAt }); return; }
                        setData(state => ({ ...state, completed: state.completed + (task.completedAt ? -1 : 1),
                          tasks: state.tasks.map(item => item.id === task.id ? { ...item, completedAt: item.completedAt ? null : new Date().toISOString() } : item) }));
                      }}>{task.completedAt && <Check size={15}/>}</button>
                    <span className={`category-icon ${task.category.toLowerCase()}`} title={label}><Icon size={19}/></span>
                    <button className="task-text" onClick={() => { setSelectedTask(task.id); setError(""); }}><strong>{task.title}</strong><span>{task.description || label}</span></button>
                    {task.time && <span className="task-time"><Clock3 size={14}/>{task.time}</span>}
                    <button className="task-comments" aria-label={`Комментарии к делу «${task.title}»`} onClick={() => { setSelectedTask(task.id); setError(""); }}>
                      <MessageCircle size={17}/>{task.comments.length > 0 && task.comments.length}</button>
                  </article>;
                })}
                {!visibleTasks.length && <div className="empty"><CalendarDays size={23}/><p>{tasks.length ? "В этой категории пока пусто" : "На этот день пока нет дел"}</p></div>}
              </div>
            </section>
          </div>
          <aside className="right-column">
            <section className="side-card progress-card">
              <div className="panel-heading"><h2>Прогресс дня</h2><strong className="progress-value">{percent}%</strong></div>
              <p>{done} из {tasks.length} дел выполнено</p>
              <div className="progress-track" role="progressbar" aria-label="Прогресс дня" aria-valuenow={percent}><span style={{ width: percent + "%" }}/></div>
            </section>
          </aside>
        </div> : section === "chat" ? <section className="subpage">
          <h1>Семейный чат</h1>
          <div className="side-card chat-card">
            {data.messages.length ? data.messages.map(message => <div key={message.id} className={message.author.id === data.user.id ? "bubble own" : "bubble"}>
              <small>{message.author.name} · {clock(message.createdAt)}</small><p>{message.text}</p></div>) : <div className="empty"><MessageCircle/><p>Здесь появятся сообщения семьи</p></div>}
          </div>
          <form className="composer" onSubmit={event => submitNote(event, "message")}><input name="text" aria-label="Сообщение" placeholder="Написать сообщение…" required maxLength={1000}/><button className="button primary" disabled={pending} aria-label="Отправить сообщение"><Send size={18}/></button></form>
        </section> : section === "awards" ? <section className="subpage">
          <h1>Награды</h1><p className="subtitle">За каждое выполненное дело экипаж получает 10 звёзд.</p>
          <div className="side-card award-balance"><Star size={27} fill="currentColor"/><strong>{stars}</strong><span>звёзд в копилке</span></div>
          <div className="award-grid">{milestones.map(({ title, detail, icon: Icon, stars: target }) => <article className="side-card award" key={title}>
            <span className={stars >= target ? "tile gold" : "tile mint"}><Icon size={22}/></span><h2>{title}</h2><p>{detail}</p>
            <small>{stars >= target ? "Открыто" : `${stars} / ${target} звёзд`}</small></article>)}</div>
        </section> : <section className="subpage">
          <h1>Экипаж</h1>
          <div className="settings-grid">
            <article className="side-card settings-card">
              <div className="panel-heading"><h2>Участники</h2><span className="tile mint" role="img" aria-label="Маскот Орбиты"><Bot size={20}/></span></div>
              {data.members.map(person => <div className="member" key={person.id}><span className="avatar">{person.name[0]}</span><strong>{person.name}</strong><small>{person.role === "PARENT" ? "Родитель" : "Ребёнок"}</small></div>)}
              {data.invite && <div className="invite-box"><label htmlFor="invite-code">Код приглашения для ребёнка</label>
                <div className="copy-row"><input id="invite-code" readOnly value={data.invite}/><button className="icon-button" aria-label="Скопировать ссылку приглашения"
                  onClick={() => void copy(location.origin + "/#invite=" + encodeURIComponent(data.invite || ""))}><Copy size={17}/></button></div>
                <button className="text-button" disabled={pending} onClick={() => void mutate({ action: "invite" })}>Обновить код</button></div>}
              {session !== "live" ? <button className="button primary" onClick={() => open("auth", "parent")}>Создать экипаж</button> :
                <button className="text-button mobile-logout" disabled={pending}
                  onClick={() => void mutate({ action: "logout" })}><LogOut size={15}/> Выйти</button>}
            </article>
            <article className="side-card settings-card">
              <div className="panel-heading"><h2>Уведомления</h2><span className="tile gold"><BellRing size={19}/></span></div>
              <p>Напоминания и события экипажа появляются в колокольчике. Для уведомлений браузера оставь Орбиту открытой.</p>
              <button className="button" disabled={notificationEnabled} onClick={() => void enableNotifications()}>{notificationEnabled ? "Уведомления включены" : "Включить уведомления браузера"}</button>
            </article>
          </div>
        </section>}
      </main>
    </div>

    {modal === "auth" && <Modal title={authMode === "login" ? "Вход на Орбиту" : authMode === "parent" ? "Создать экипаж" : "Присоединиться к экипажу"} onClose={() => open(null)}>
      <div className="filters auth-tabs">{([["login", "Войти"], ["parent", "Родитель"], ["child", "Ребёнок"]] as const).map(([mode, label]) =>
        <button key={mode} className={authMode === mode ? "selected" : ""} onClick={() => open("auth", mode)}>{label}</button>)}</div>
      <form className="stack" onSubmit={submitAuth}>
        {authMode !== "login" && <label>Имя<input name="name" autoComplete="name" required maxLength={45}/></label>}
        <label>Email<input name="email" type="email" autoComplete="username" required maxLength={254}/></label>
        <label>Пароль<input name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} required minLength={8} maxLength={128}/></label>
        {authMode === "child" && <label>Код приглашения<input name="invite" required maxLength={80} value={inviteInput} onChange={event => setInviteInput(event.target.value)}/></label>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary" disabled={pending}>{authMode === "login" ? "Войти" : "Зарегистрироваться"}</button>
      </form>
    </Modal>}
    {modal === "task" && <Modal title="Новое дело" onClose={() => open(null)}>
      <form className="stack" onSubmit={addTask}>
        <label>Название<input name="title" required maxLength={120} placeholder="Что нужно сделать?"/></label>
        <label>Описание<textarea name="description" maxLength={1000} rows={3}/></label>
        <label>Категория<select name="category">{categories.map(category => <option key={category} value={category}>{categoryInfo[category].label}</option>)}</select></label>
        <div className="form-row"><label>День<input name="day" type="date" defaultValue={day} required/></label><label>Время (МСК)<input type="time" name="time"/></label></div>
        <label className="check-label"><input type="checkbox" name="remind"/> Напомнить ребёнку в указанное время</label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary" disabled={pending}>Добавить дело</button>
      </form>
    </Modal>}
    {modal === "notices" && <Modal title="Уведомления" onClose={() => open(null)}>
      {data.unread > 0 && <button className="text-button" disabled={pending} onClick={() => void mutate({ action: "read" })}>Прочитать все</button>}
      {data.notifications.length ? <div className="notice-list">{data.notifications.map(notice => <div key={notice.id} className={notice.readAt ? "notice" : "notice unread"}>
        <BellRing size={17}/><span>{notice.text}</span>
      </div>)}</div> : <div className="empty"><Bell size={24}/><p>Новых событий пока нет</p></div>}
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>}
    {!modal && detail && <Modal title={detail.title} onClose={() => { setSelectedTask(null); setError(""); }}>
      {detail.description && <p className="subtitle">{detail.description}</p>}
      <div className="detail-meta"><span>{longDate.format(noon(detail.day))}</span>{detail.time && <span>{detail.time} МСК</span>}{detail.remindAt && <BellRing size={15}/>}</div>
      <h3>Комментарии</h3>
      <div className="comments-list">{detail.comments.length ? detail.comments.map(comment => <div key={comment.id} className="bubble">
        <small>{comment.author.name} · {clock(comment.createdAt)}</small><p>{comment.text}</p></div>) : <p className="subtitle">Комментариев пока нет</p>}</div>
      <form className="composer" onSubmit={event => submitNote(event, "comment", detail.id)}><input name="text" aria-label="Комментарий" placeholder="Оставить комментарий…" required maxLength={1000}/><button className="button primary" disabled={pending} aria-label="Отправить комментарий"><Send size={17}/></button></form>
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>}
  </div>;
}
