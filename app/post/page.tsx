"use client";

import { RoleGate } from "@/components/game/role-gate";
import { PostScreen } from "@/components/post/post-screen";

export default function PostPage() {
  return <RoleGate role="post">{(identity) => <PostScreen identity={identity} />}</RoleGate>;
}
