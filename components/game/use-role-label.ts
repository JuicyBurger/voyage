"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Identity, PostKind } from "@/lib/types";

export type RoleLabel = { name: string; color?: string; postKind?: PostKind };

// Looks up the display name for a role: team name + colour, post name, or "The MC".
export function useRoleLabel(identity: Identity | null): RoleLabel | null {
  const [label, setLabel] = useState<RoleLabel | null>(null);

  useEffect(() => {
    if (!identity) return;
    const db = supabaseBrowser();
    let cancelled = false;
    (async () => {
      if (identity.role === "team" && identity.team_id) {
        const { data } = await db.from("teams").select("name, color").eq("id", identity.team_id).single();
        if (!cancelled && data) setLabel({ name: data.name, color: data.color });
      } else if (identity.role === "post" && identity.post_id) {
        const { data } = await db.from("posts").select("name, kind").eq("id", identity.post_id).single();
        if (!cancelled && data) setLabel({ name: data.name, postKind: data.kind });
      } else {
        setLabel({ name: copy.roles.mc });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity]);

  return label;
}
