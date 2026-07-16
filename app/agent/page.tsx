import { redirect } from "next/navigation";

export default function AgentRoot() {
  redirect("/agent/login");
}
