import { Anvil, Beer, Hammer, Map, Sailboat, type LucideIcon } from "lucide-react";
import type { PostKind } from "./types";

export const POST_ICONS: Record<PostKind, LucideIcon> = {
  shipwright: Hammer,
  sailmaker: Sailboat,
  cartographer: Map,
  inn: Beer,
  blacksmith: Anvil,
};
