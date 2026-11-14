export const categories = ["SCHOOL", "HOME", "PERSONAL"] as const;
export type Category = typeof categories[number];
export type Role = "PARENT" | "CHILD";
export type Person = { id: string; name: string; role: Role };
export type Note = { id: string; text: string; createdAt: string; author: Person };
export type Task = {
  id: string; title: string; description: string; day: string; time: string | null;
  remindAt: string | null; category: Category; completedAt: string | null; comments: Note[];
};
export type Notice = {
  id: string; text: string; kind: string; readAt: string | null;
};
export type FamilyState = {
  user: Person; members: Person[]; invite: string | null;
  tasks: Task[]; messages: Note[]; notifications: Notice[]; unread: number; completed: number;
};
