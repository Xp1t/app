import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./styles.css";

export const metadata: Metadata = {
  title: "Орбита — семейный планировщик",
  description: "Семейные дела, школьные задания и маленькие победы.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
