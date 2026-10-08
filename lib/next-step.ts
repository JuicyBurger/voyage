import { itemName, nextStepText } from "./copy";
import type { GameData } from "./use-game";
import { PARTS, type Part, type Team } from "./types";

export function hasPart(team: Team, part: Part) {
  return team[`has_${part}`];
}

// One sentence telling the team what to do next.
export function nextStep(data: GameData, team: Team): string {
  const { game, posts, stock, jobCounts, prices } = data;
  const cfg = game.config;

  if (game.status === "ended") return nextStepText.ended;
  if (game.status === "setup" || game.status === "ready") return nextStepText.notStarted;
  if (game.paused_at) return nextStepText.paused;
  if (team.boat_done_at) return nextStepText.boatDone(cfg.scoring.gold_per_point);

  const price = (p: Part) => prices?.[p] ?? cfg.parts[p].price;
  const activePosts = posts.filter((x) => x.active !== false);
  const postName = (p: Part) =>
    activePosts.find((x) => x.kind === cfg.parts[p].post)?.name ?? cfg.parts[p].post;

  const missing = PARTS.filter((p) => !hasPart(team, p)).sort((a, b) => price(a) - price(b));
  // Only suggest parts sold at an active (staffed) post.
  const inStock = missing.filter((p) => {
    if ((stock[p] ?? 0) <= 0) return false;
    return activePosts.some((x) => x.kind === cfg.parts[p].post);
  });

  const affordable = inStock.find((p) => price(p) <= team.gold);
  if (affordable) return nextStepText.buy(postName(affordable), itemName(affordable), price(affordable));

  const target = inStock[0];
  if (!target) {
    const anyInStock = missing.filter((p) => (stock[p] ?? 0) > 0);
    if (anyInStock.length === 0) return nextStepText.noStock(itemName(missing[0]));
    // Parts exist but only at parked posts — point at active posts with jobs.
  }

  const withJobs = activePosts
    .filter((p) => {
      const done = jobCounts.find((j) => j.team_id === team.id && j.post_id === p.id)?.count ?? 0;
      return done < cfg.jobs_per_post;
    })
    .sort((a, b) => cfg.job_pay[b.kind] - cfg.job_pay[a.kind])
    .slice(0, 3)
    .map((p) => p.name);

  if (!target) {
    const need = Math.max(1, price(missing[0]) - team.gold);
    return withJobs.length
      ? nextStepText.earn(need, itemName(missing[0]), withJobs)
      : nextStepText.noStock(itemName(missing[0]));
  }

  return nextStepText.earn(price(target) - team.gold, itemName(target), withJobs);
}
