// All player-facing text lives here, so it can be translated later.

import type { Action, WorldEvent } from "./types";

export const copy = {
  appName: "Voyage Companion",

  landing: {
    title: "Ahoy!",
    body: "Join with a game code, continue a saved login, or host a new game.",
    join: "Join a game",
    host: "Host a game",
    continue: "Go back to my screen",
    myGames: "On this phone",
    forget: "Forget",
    noSaved: "No saved logins on this phone yet.",
  },

  join: {
    checking: "Checking your card…",
    badToken: "This QR code does not work. Ask the MC for help.",
    youAre: "You are:",
    start: "Start",
    startHint: "Tap Start. This turns on sound and keeps your screen awake.",
    title: "Join a game",
    codeLabel: "Game code",
    codeHint: "Six letters from your MC or your card.",
    find: "Find game",
    pickRole: "Who are you?",
    pinLabel: "Your PIN",
    pinHintMc: "Eight characters from your MC card.",
    pinHint: "Six digits from your card.",
    enter: "Enter",
    back: "Back",
    gameFound: (name: string, code: string) => `${name} · ${code}`,
    mcRole: "MC",
  },

  host: {
    title: "Host a game",
    nameLabel: "Game name",
    namePlaceholder: "CYUT Freshgrad Night",
    passwordLabel: "Host password",
    create: "Create game",
    saveTitle: "Save these now",
    saveBody: "Use these to get back in as the MC on any device.",
    gameCode: "Game code",
    mcPin: "MC PIN",
    copy: "Copy",
    copied: "Copied",
    savedCheck: "I saved my MC PIN",
    continue: "Continue to setup",
    step: "Step 1 of 4",
  },

  setup: {
    title: "MC setup",
    step: "Step 2 of 4",
    continue: "Continue to phones",
    save: "Save",
    resetNumbers: "Reset to default",
    resetNumbersDone: "Numbers set to defaults. Tap Save to keep them.",
    backPanel: "Back to MC panel",
  },

  lobby: {
    title: "Phones",
    step: "Step 3 of 4",
    body: "Print the QR sheet or share the game code. Watch who joins below.",
    gameCode: "Game code",
    openQr: "Open QR sheet",
    backSetup: "Back to setup",
    start: "Start game",
    starting: "Starting…",
    waiting: "Waiting",
    connected: "Connected",
    connectedCount: (n: number, total: number) => `${n} of ${total} connected`,
    startWarn: "Some phones are still waiting. Start the game anyway?",
    showPins: "Show PINs",
    hidePins: "Hide PINs",
    showQr: "QR",
    scanHint: "Scan with the phone camera",
    closeQr: "Close",
  },

  codes: {
    title: "Codes",
    show: "Show codes",
    hide: "Hide codes",
    rotate: "New PIN",
    rotateWarn: "The printed card for this role will stop working. Continue?",
    rotated: "New PIN ready. Update the printed card.",
    expires: (date: string) => `This game is deleted on ${date}.`,
    rejoin: "Rejoin code",
    rejoinShow: "Show rejoin code",
    rejoinHide: "Hide",
    rejoinLine: (code: string, pin: string) => `Game ${code} · PIN ${pin}`,
    cardLine: (code: string, name: string, pin: string) => `Game ${code} · ${name} · PIN ${pin}`,
  },

  roles: {
    mc: "The MC",
    team: "Team phone",
    post: "Post phone",
  },

  common: {
    youAre: (name: string) => `You are: ${name}`,
    alsoOpen: "This role is also open on another phone.",
    noRole: "You are not logged in. Join with a game code or scan your QR.",
    loading: "Loading…",
    loginChanged: "Your login was changed by the MC. Ask for the new PIN.",
    joinAgain: "Join again",
  },

  status: {
    setup: "Setting up",
    ready: "Ready",
    running: "Playing",
    paused: "PAUSED",
    last_call: "Last Call",
    ended: "Game over",
  },

  items: {
    hull: "Hull",
    mast: "Mast",
    sail: "Sail",
    map: "Map",
    flag: "Pirate Flag",
    sword: "Sword",
    shield: "Shield",
  } as Record<string, string>,

  team: {
    gold: "Gold",
    boat: "Your boat",
    buyAt: (post: string) => `Buy at the ${post}`,
    owned: "Done",
    nextStep: "Next step",
    items: "Items",
    flag: (left: number) => `Pirate Flag: ${left} raid${left === 1 ? "" : "s"} left`,
    noFlag: "No Pirate Flag",
    sword: "Sword: +1 to your dice",
    noSword: "No Sword",
    shield: "Shield: blocks the next raid",
    noShield: "No Shield",
    doubleTitle: "Double Profit",
    doubleOff: "Use Double Profit on my next passed job or won raid",
    doubleOn: "DOUBLE PROFIT ARMED. Tap to turn off.",
    doubleUsed: "Double Profit is used.",
    posts: "Posts",
    jobsLeft: (left: number, total: number) => `Jobs left: ${left}/${total}`,
    free: "Free",
    busy: "Busy",
    servingYou: "Serving you",
    waiting: (n: number) => `${n} waiting`,
    challengeTitle: (post: string) => `Challenge at the ${post}`,
    journey: "Journey log",
    noJourney: "Your story starts here.",
    safeFor: (time: string) => `You are safe from raids for ${time}.`,
    myCode: "My raid code",
    showCode: "Show code",
    hideCode: "Hide",
    codeHint: "If a pirate crew raids you, you must show them this code.",
  },

  raid: {
    button: (left: number) => `Raid! (${left} left)`,
    title: "Raid a crew",
    pickTarget: "Which crew do you raid?",
    safe: (time: string) => `Safe ${time}`,
    maxed: "Raided too often",
    typeCode: (team: string) => `Ask ${team} for their raid code and type it in.`,
    go: "Raid!",
    back: "Back",
    rolling: "Rolling the dice…",
    you: "You",
    sword: (bonus: number) => `+${bonus} Sword`,
    win: (amount: number) => `You won! You took ${amount} gold.`,
    loss: "You lost the fight. No gold this time.",
    blocked: (team: string) => `${team} had a Shield. The raid was blocked.`,
    defWin: (team: string) => `${team} raided you, but you won the fight!`,
    defLoss: (team: string, amount: number) => `${team} raided you and took ${amount} gold!`,
    defBlocked: (team: string) => `${team} raided you. Your Shield blocked it!`,
    raidedTitle: "RAID!",
    extras: (doubled: boolean, pirateHour: boolean, bounty: boolean) =>
      [doubled && "Double Profit!", pirateHour && "Pirate Hour!", bounty && "Bounty!"].filter(Boolean).join(" "),
    close: "OK",
  },

  post: {
    pickTeam: "Tap a team",
    jobsHere: (done: number, total: number) => `Jobs here: ${done}/${total}`,
    doubleArmed: "DOUBLE PROFIT ARMED",
    pass: (amount: number) => `Pass (+${amount})`,
    fail: (amount: number) => `Fail (+${amount})`,
    sell: "Sell",
    stock: (n: number) => `${n} left`,
    buy: (price: number) => `Cost ${price}`,
    serving: (team: string) => `Serving: ${team}`,
    notServing: "Serving: nobody",
    done: "Done",
    waiting: "Waiting",
    undo: (what: string, left: string) => `Undo: ${what} (${left})`,
    toastJob: (team: string, amount: number, doubled: boolean, goldRush?: boolean) => {
      const extra = [doubled && "Double Profit!", goldRush && "Gold Rush!"].filter(Boolean).join(" ");
      return `${team} +${amount} gold${extra ? ` (${extra})` : ""}`;
    },
    toastBuy: (team: string, item: string, price: number) => `${team} bought the ${item} for ${price} gold`,
    toastUndo: "Undone.",
    reason: {
      owned: "Already owned",
      noStock: "None left",
      gold: (short: number) => `Short by ${short}`,
      shield: "Already has one",
      closed: "Not now",
    },
  },

  mc: {
    ready: "Ready",
    unready: "Back to setup",
    start: "Start game",
    pause: "Pause",
    resume: "Resume",
    lastCall: "Last Call",
    end: "End game",
    confirmEnd: "End the game now? Scores will be final.",
    timeForLastCall: "Time for Last Call!",
    timeToEnd: "Time to end the game",
    nextEvent: "Next event",
    noNextEvent: "No more scheduled events.",
    atMinute: (m: number) => `at minute ${m}`,
    dueNow: "Due now",
    fireNow: "Fire now",
    fired: "Fired",
    schedule: "Schedule",
    autoFire: "Auto-fire scheduled events",
    events: "Events",
    fire: "Fire",
    stop: "Stop",
    running: "Running now",
    messagePlaceholder: "Custom message for every phone",
    send: "Send",
    priceDial: "Price dial",
    dialOff: "Off",
    dialDown: (p: number) => `−${p}%`,
    dialUp: (p: number) => `+${p}%`,
    teams: "Teams",
    col: {
      team: "Team",
      gold: "Gold",
      parts: "Parts",
      items: "Items",
      raids: "Raids left",
      wins: "Raid wins",
      raided: "Raided",
      safe: "Safe",
      boat: "Boat",
    },
    tapToAdjust: "Tap a team to fix a number.",
    adjustTitle: (team: string) => `Fix ${team}`,
    adjustGold: "Change gold by",
    reason: "Reason (required)",
    reasonPlaceholder: "Why? e.g. post tapped the wrong team",
    save: "Save",
    stockAndPosts: "Stock and posts",
    stock: "Stock",
    jobs: "Jobs per team",
    serving: "Serving",
    waiting: "Waiting",
    pace: "Pace check",
    paceParts: (n: number) => `Parts bought so far: ${n}`,
    paceAt: (minute: string, normal: number) => `At minute ${minute} we expect about ${normal}.`,
    paceOn: "On pace",
    paceSlow: "Slow: consider the price dial",
    paceFast: "Fast: ask posts to use the full 60 seconds",
    paceWait: "Pace check starts at minute 15.",
    feed: "Activity feed",
    noFeed: "Nothing yet.",
    links: { setup: "Setup", lobby: "Phones", qr: "QR codes", tv: "TV screen" },
    rehearsal: "Rehearsal",
    rehearsalHint: "Practice only. The clock runs 4× faster. Turn it on before Start.",
    postGame: "What's next?",
    postGameHint: "When you are done with the reveal, close the session or start over.",
    closeGame: "End game",
    closeGameHint: "Cleans up this game. Every phone and the TV are forced out.",
    confirmClose: "End this game for everyone? Phones will be signed out and the game is deleted.",
    restartGame: "Restart game",
    restartGameHint: "Cleans up play data and signs out team and post phones, then back to setup.",
    confirmRestart: "Restart from setup? Team and post phones will be signed out. Your MC login stays.",
  },

  rehearsal: {
    badge: "REHEARSAL · the clock is 4× faster",
  },

  scores: {
    points: "Points",
    place: (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`),
    breakdown: (s: { parts: number; gold: number; raid_wins: number; boat_rank: number | null }) =>
      [
        `${s.parts}/4 parts`,
        s.boat_rank ? `boat #${s.boat_rank}` : null,
        `${s.gold} gold`,
        s.raid_wins ? `${s.raid_wins} raid win${s.raid_wins === 1 ? "" : "s"}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
  },

  reveal: {
    title: "THE FINAL VOYAGE",
    waiting: "Who reached the island first?",
    winner: (team: string) => `${team} win!`,
    scoresTitle: "Final scores",
    scoresWaiting: "Waiting for the MC to start the reveal.",
    mcTitle: "Final reveal",
    mcHint: "End the game first. Then start the reveal and tap Next for each place, from last to first.",
    start: "Start the reveal",
    next: (place: string) => `Reveal ${place} place`,
    back: "Back",
    done: "All places are shown.",
    shown: (n: number, total: number) => `${n} of ${total} places shown`,
    confirmStart: "Start the reveal? Scores will be frozen and you can no longer fix numbers.",
  },

  tv: {
    notFound: "No game with this code.",
    boats: "Boats finished",
    noBoats: "No boat is finished yet.",
    feed: "On the seas",
    scores: "Scores",
    scoresHidden: "Scores are a secret until the end!",
    showScores: "Show scores on the TV",
  },

  events: {
    gold_rush: "Gold Rush",
    storm: "Storm",
    supply_ship: "Supply Ship",
    lighthouse_aid: "Lighthouse Aid",
    market_sale: "Market Sale",
    pirate_hour: "Pirate Hour",
    bounty: "Bounty",
    message: "Message",
    last_call: "Last Call",
  } as Record<string, string>,

  storm: {
    title: "STORM!",
    body: "Find shelter at a post. Nobody can work, buy or raid.",
    wait: (time: string) => `Wait ${time}`,
  },

  errors: {
    BAD_TOKEN: () => "This QR code does not work. Ask the MC for help.",
    NOT_STARTED: () => "The game has not started yet.",
    PAUSED: () => "The game is paused.",
    GAME_OVER: () => "The game is over.",
    STORM: (a) => `Storm! Wait ${clockText(Number(a.seconds_left ?? 0))}.`,
    LAST_CALL: () => "Last Call. No more raids.",
    BAD_STATE: () => "You cannot do that right now.",
    JOB_LIMIT: (a) => `${a.team} already did ${a.limit} jobs here.`,
    NO_STOCK: (a) =>
      a.supply_minute
        ? `No ${itemName(a.item)}s left. The Supply Ship brings more at minute ${a.supply_minute}.`
        : `No ${itemName(a.item)}s left.`,
    NOT_ENOUGH_GOLD: (a) => `${a.team} need ${a.need} gold. They have ${a.have}.`,
    ALREADY_OWNED: (a) => `${a.team} already have the ${itemName(a.item)}.`,
    HAS_SHIELD: (a) => `${a.team} already hold a Shield.`,
    WRONG_POST: () => "You do not sell that here.",
    NOTHING_TO_UNDO: () => "Nothing to undo. Undo works for 2 minutes.",
    UNDO_NO_GOLD: (a) => `${a.team} already spent that gold. Ask the MC to fix this.`,
    UNDO_FLAG_USED: (a) => `${a.team} already used a raid. Ask the MC to fix this.`,
    UNDO_SHIELD_USED: (a) => `${a.team} already used the Shield. Ask the MC to fix this.`,
    DOUBLE_USED: () => "Double Profit is already used.",
    OWN_TEAM: () => "You cannot raid your own crew.",
    NO_RAIDS: () => "You need a Pirate Flag with raids left.",
    WRONG_CODE: (a) =>
      `Wrong code. ${a.tries_left} ${a.tries_left === 1 ? "try" : "tries"} left before a 30 second wait.`,
    RAID_BLOCKED: (a) => `Too many wrong codes. Wait ${clockText(Number(a.seconds_left ?? 0))}.`,
    DEFENDER_SAFE: (a) => `${a.team} are safe for ${clockText(Number(a.seconds_left ?? 0))} more.`,
    MAX_RAIDED: (a) => `${a.team} were raided too many times. Pick another crew.`,
    NOTHING_TO_STEAL: (a) => `${a.team} have no gold. Nothing to steal. Your raid was not used.`,
    ALREADY_FIRED: () => "That event already fired.",
    NO_SALE_PART: () => "No part can go on sale right now.",
    NOTHING_TO_STOP: () => "That event is already over.",
    NEGATIVE_GOLD: (a) => `${a.team} only have ${a.have} gold.`,
    NEED_REASON: () => "Please write a reason.",
    REVEAL_LOCKED: () => "The final reveal has started. Scores are locked.",
    REHEARSAL_LOCKED: () => "Turn rehearsal on or off before the game starts. Reset the game to change it.",
    NOT_ENDED: () => "End the game first.",
    BAD_PASSWORD: () => "Wrong password.",
    GAME_NOT_FOUND: () => "We could not find that game. Check the code with your MC.",
    WRONG_PIN: (a) =>
      `That PIN is not right. ${a.tries_left} ${a.tries_left === 1 ? "try" : "tries"} left.`,
    RATE_LIMITED: (a) => `Too many tries. Wait ${clockText(Number(a.seconds_left ?? 0))}.`,
    LOGIN_CHANGED: () => "Your login was changed by the MC. Ask for the new PIN.",
    NOT_ALLOWED: () => "Your phone cannot do this.",
    BAD_INPUT: () => "Something is wrong with that input.",
    SETUP_LOCKED: () => "The game has started. Setup is locked.",
    CONFIG_LOCKED: () => "Numbers are locked after Ready. Go back to setup to change them.",
    IN_PROGRESS: () => "Still working on it. Try again in a second.",
    NETWORK: () => "No connection. Try again.",
    SERVER_ERROR: () => "Something went wrong. Try again.",
  } as Record<string, (a: Record<string, unknown>) => string>,
};

export function itemName(item: unknown): string {
  return copy.items[String(item)] ?? String(item);
}

export function clockText(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function errorMessage(code: string | undefined, args: Record<string, unknown> = {}) {
  const fn = code ? copy.errors[code] : undefined;
  return fn ? fn(args) : copy.errors.SERVER_ERROR(args);
}

// ---------------------------------------------------------------------------
// Story lines
// ---------------------------------------------------------------------------

function signed(n: number) {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

// The team's own journey log ("Passed the job at the Sailmaker. +12 gold.").
export function journeyLine(a: Action): string {
  const post = String(a.details.post_name ?? "post");
  switch (a.kind) {
    case "job_pass": {
      let extra = "";
      if (a.details.doubled) extra += " Double Profit!";
      if (a.details.gold_rush) extra += " Gold Rush!";
      return `Passed the job at the ${post}. +${a.amount} gold.${extra}`;
    }
    case "job_fail":
      return `Tried the job at the ${post}. +${a.amount} gold.`;
    case "buy":
      return `Bought the ${itemName(a.item)} at the ${post}. −${Math.abs(a.amount)} gold.`;
    case "boat_done":
      return `Your boat is finished! Place ${a.details.rank}.`;
    case "undo":
      return `The ${post} undid the last action. ${signed(a.amount)} gold.`;
    case "double_on":
      return "Double Profit is armed.";
    case "double_off":
      return "Double Profit is off.";
    case "raid": {
      const other = String(a.details.other);
      if (a.details.result === "win") return `Raided ${other} and won! +${a.amount} gold.${a.details.doubled ? " Double Profit!" : ""}`;
      if (a.details.result === "blocked") return `Raided ${other}, but their Shield blocked it.`;
      return `Raided ${other} and lost the fight.`;
    }
    case "raided": {
      const other = String(a.details.other);
      if (a.details.result === "win") return `${other} raided you and took ${Math.abs(a.amount)} gold.`;
      if (a.details.result === "blocked") return `${other} raided you. Your Shield blocked it.`;
      return `${other} raided you, but you won the fight.`;
    }
    case "lighthouse":
      return `Lighthouse Aid! +${a.amount} gold.`;
    case "adjust":
      return a.details.field === "gold"
        ? `The MC changed your gold: ${signed(a.amount)}. (${a.details.reason})`
        : `The MC fixed your ${fieldName(a.details.field)}. (${a.details.reason})`;
    default:
      return a.amount ? `${signed(a.amount)} gold.` : a.kind;
  }
}

// The public activity feed ("Bears passed the job at the Sailmaker.").
export function feedLine(a: Action, team: string): string | null {
  const post = String(a.details.post_name ?? "post");
  switch (a.kind) {
    case "job_pass":
      return `${team} passed the job at the ${post}. +${a.amount} gold.`;
    case "job_fail":
      return `${team} tried the job at the ${post}. +${a.amount} gold.`;
    case "buy":
      return `${team} bought the ${itemName(a.item)}.`;
    case "boat_done":
      return `${team} finished their boat! Place ${a.details.rank}.`;
    case "undo":
      return `The ${post} undid an action for ${team}.`;
    case "raid": {
      const other = String(a.details.other);
      if (a.details.result === "win") return `${team} raided ${other} and took ${a.amount} gold!`;
      if (a.details.result === "blocked") return `${team} raided ${other}, but a Shield blocked it!`;
      return `${team} raided ${other} and lost the fight!`;
    }
    case "lighthouse":
      return `${team} got Lighthouse Aid. +${a.amount} gold.`;
    case "adjust":
      return a.details.field === "gold"
        ? `MC: ${team} gold ${signed(a.amount)} (${a.details.reason})`
        : `MC: ${team} ${fieldName(a.details.field)} = ${a.details.value} (${a.details.reason})`;
    default:
      return null;
  }
}

const FIELD_NAMES: Record<string, string> = {
  gold: "gold",
  raids_left: "raids left",
  raid_wins: "raid wins",
  shield_count: "Shield",
  has_hull: "Hull",
  has_mast: "Mast",
  has_sail: "Sail",
  has_map: "Map",
  has_flag: "Pirate Flag",
  has_sword: "Sword",
};

export function fieldName(field: unknown): string {
  return FIELD_NAMES[String(field)] ?? String(field);
}

export function eventName(kind: string): string {
  return copy.events[kind] ?? kind;
}

// The small line at the top of every screen while a timed event runs.
export function stripText(e: WorldEvent): string {
  const p = e.payload;
  switch (e.kind) {
    case "gold_rush":
      return `Gold Rush: +${p.bonus} gold per passed job (Double Profit doubles it)`;
    case "storm":
      return "Storm: nobody can work, buy or raid";
    case "market_sale":
      return `Market Sale: ${itemName(p.part)} −${p.discount} gold`;
    case "pirate_hour":
      return `Pirate Hour: won raids steal ×${p.multiplier}`;
    case "bounty":
      return `Bounty on ${joinNames((p.teams as string[]) ?? [])}: +${p.bonus} gold`;
    default:
      return eventName(e.kind);
  }
}

export function priceDialText(percent: number) {
  return percent < 0 ? `Parts ${percent}%` : `Parts +${percent}%`;
}

export type Banner = { title: string; body: string; tone: "good" | "bad" | "info"; big?: boolean };

// Full-screen banner text for a world event. null = no banner.
export function bannerFor(e: WorldEvent): Banner | null {
  const p = e.payload;
  switch (e.kind) {
    case "boat_finished": {
      const rank = Number(p.rank);
      const place = rank === 1 ? "First to the island!" : `Place ${rank}.`;
      const bonus = Number(p.bonus) > 0 ? ` +${p.bonus} points.` : "";
      return { title: "BOAT FINISHED!", body: `${p.team} have built their boat! ${place}${bonus}`, tone: "good", big: true };
    }
    case "last_call":
      return {
        title: "LAST CALL",
        body: "No more raids. Posts only serve teams already in line.",
        tone: "info",
      };
    case "end":
      return { title: "LAND HO!", body: "The game is over. Scores are on your phone.", tone: "info" };
    case "gold_rush":
      return {
        title: "GOLD RUSH!",
        body: `Passed jobs pay +${p.bonus} gold. Double Profit doubles that bonus. Hurry!`,
        tone: "good",
      };
    case "storm":
      return { title: "STORM!", body: "Find shelter at a post. Nobody can work or raid.", tone: "bad" };
    case "supply_ship":
      return { title: "SUPPLY SHIP!", body: `The supply ship is in! ${p.add} more of every part.`, tone: "good" };
    case "lighthouse_aid": {
      const names = (p.teams as string[]) ?? [];
      return { title: "LIGHTHOUSE AID", body: `${joinNames(names)} ${names.length === 1 ? "gets" : "get"} ${p.amount} gold.`, tone: "good" };
    }
    case "market_sale":
      return { title: "MARKET SALE!", body: `The ${itemName(p.part)} costs ${p.discount} gold less.`, tone: "good" };
    case "pirate_hour":
      return { title: "PIRATE HOUR!", body: `Won raids steal ${p.multiplier} times more gold.`, tone: "bad" };
    case "bounty":
      return {
        title: "BOUNTY!",
        body: `Win a raid against ${joinNames((p.teams as string[]) ?? [])} for +${p.bonus} gold.`,
        tone: "bad",
      };
    case "price_dial": {
      const pct = p.percent as number | null;
      if (pct === null) return { title: "PRICES NORMAL", body: "Part prices are back to normal.", tone: "info" };
      return pct < 0
        ? { title: "PRICES DOWN!", body: `All parts cost ${-pct}% less.`, tone: "good" }
        : { title: "PRICES UP!", body: `All parts cost ${pct}% more.`, tone: "bad" };
    }
    case "message":
      return { title: "AHOY!", body: String(p.text), tone: "info" };
    default:
      return null;
  }
}

export const nextStepText = {
  notStarted: "Wait for the MC to start the game.",
  paused: "The game is paused. Wait for the MC.",
  ended: "The game is over. Your place is on this screen.",
  boatDone: (goldPerPoint: number) =>
    `Your boat is done! Keep earning gold. Every ${goldPerPoint} gold is 1 point.`,
  buy: (post: string, item: string, price: number) => `Go to the ${post} and buy the ${item} (${price} gold).`,
  earn: (need: number, item: string, posts: string[]) =>
    posts.length
      ? `You need ${need} more gold for the ${item}. ${joinNames(posts)} ${posts.length === 1 ? "has" : "have"} jobs left.`
      : `You need ${need} more gold for the ${item}. No jobs left. Try a raid or wait for an event.`,
  noStock: (item: string) => `No ${item}s left right now. Earn gold and wait for the Supply Ship.`,
};

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
