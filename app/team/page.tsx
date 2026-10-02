"use client";

import { RoleGate } from "@/components/game/role-gate";
import { TeamScreen } from "@/components/team/team-screen";

export default function TeamPage() {
  return <RoleGate role="team">{(identity) => <TeamScreen identity={identity} />}</RoleGate>;
}
