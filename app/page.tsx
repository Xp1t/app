import { dayKey } from "../lib/dates";
import Scheduler from "./scheduler";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Scheduler today={dayKey()} />;
}
