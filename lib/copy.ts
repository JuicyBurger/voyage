// All player-facing text lives here (Bahasa Indonesia). App name stays Voyage.

import type { Action, WorldEvent } from "./types";

export const copy = {
  appName: "Voyage",

  landing: {
    title: "Ahoy!",
    body: "Gabung dengan kode permainan, lanjutkan login tersimpan, atau buat permainan baru.",
    join: "Gabung permainan",
    host: "Buat permainan",
    continue: "Kembali ke layar saya",
    myGames: "Di HP ini",
    forget: "Lupa",
    noSaved: "Belum ada login tersimpan di HP ini.",
  },

  join: {
    checking: "Memeriksa kartu…",
    badToken: "Kode QR ini tidak berlaku. Minta bantuan MC.",
    youAre: "Kamu adalah:",
    start: "Mulai",
    startHint: "Ketuk Mulai. Ini mengaktifkan suara dan menjaga layar tetap menyala.",
    title: "Gabung permainan",
    codeLabel: "Kode permainan",
    codeHint: "Enam huruf dari MC atau kartumu.",
    find: "Cari permainan",
    pickRole: "Kamu siapa?",
    pinLabel: "PIN kamu",
    pinHintMc: "Delapan karakter dari kartu MC.",
    pinHint: "Enam digit dari kartumu.",
    enter: "Masuk",
    back: "Kembali",
    gameFound: (name: string, code: string) => `${name} · ${code}`,
    mcRole: "MC",
  },

  host: {
    title: "Buat permainan",
    nameLabel: "Nama permainan",
    namePlaceholder: "CYUT Freshgrad Night",
    passwordLabel: "Kata sandi host",
    create: "Buat permainan",
    saveTitle: "Simpan ini sekarang",
    saveBody: "Gunakan ini untuk masuk lagi sebagai MC di perangkat apa pun.",
    gameCode: "Kode permainan",
    mcPin: "PIN MC",
    copy: "Salin",
    copied: "Disalin",
    savedCheck: "Saya sudah menyimpan PIN MC",
    continue: "Lanjut ke pengaturan",
    step: "Langkah 1 dari 3",
  },

  setup: {
    title: "Pengaturan MC",
    step: "Langkah 2 dari 3",
    continue: "Lanjut ke HP",
    save: "Simpan",
    resetNumbers: "Kembalikan ke bawaan",
    resetNumbersDone: "Angka dikembalikan ke bawaan. Ketuk Simpan untuk menyimpan.",
    backPanel: "Kembali ke panel MC",
  },

  lobby: {
    title: "HP",
    step: "Langkah 3 dari 3",
    body: "Cetak lembar QR atau bagikan kode permainan. Pantau siapa yang bergabung di bawah.",
    gameCode: "Kode permainan",
    openQr: "Buka lembar QR",
    backSetup: "Kembali ke pengaturan",
    start: "Mulai permainan",
    starting: "Memulai…",
    waiting: "Menunggu",
    connected: "Terhubung",
    connectedCount: (n: number, total: number) => `${n} dari ${total} terhubung`,
    startWarn: "Beberapa HP masih menunggu. Mulai permainan sekarang?",
    showPins: "Tampilkan PIN",
    hidePins: "Sembunyikan PIN",
    showQr: "QR",
    scanHint: "Pindai dengan kamera HP",
    closeQr: "Tutup",
  },

  codes: {
    title: "Kode",
    show: "Tampilkan kode",
    hide: "Sembunyikan kode",
    rotate: "PIN baru",
    rotateWarn: "Kartu cetak untuk peran ini tidak akan berlaku lagi. Lanjutkan?",
    rotated: "PIN baru siap. Perbarui kartu cetak.",
    expires: (date: string) => `Permainan ini dihapus pada ${date}.`,
    rejoin: "Kode masuk kembali",
    rejoinShow: "Tampilkan kode masuk kembali",
    rejoinHide: "Sembunyikan",
    rejoinLine: (code: string, pin: string) => `Game ${code} · PIN ${pin}`,
    cardLine: (code: string, name: string, pin: string) => `Game ${code} · ${name} · PIN ${pin}`,
  },

  roles: {
    mc: "MC",
    team: "HP tim",
    post: "HP pos",
  },

  common: {
    youAre: (name: string) => `Kamu adalah: ${name}`,
    alsoOpen: "Peran ini juga terbuka di HP lain.",
    noRole: "Kamu belum masuk. Gabung dengan kode permainan atau pindai QR.",
    loading: "Memuat…",
    loginChanged: "Login kamu diubah oleh MC. Minta PIN baru.",
    joinAgain: "Gabung lagi",
  },

  status: {
    setup: "Persiapan",
    ready: "Siap",
    running: "Bermain",
    paused: "DIJEDA",
    last_call: "Last Call",
    ended: "Permainan selesai",
  },

  items: {
    hull: "Lambung",
    mast: "Tiang",
    sail: "Layar",
    map: "Peta",
    flag: "Bendera Bajak Laut",
    sword: "Pedang",
    shield: "Perisai",
  } as Record<string, string>,

  team: {
    gold: "Emas",
    boat: "Kapalmu",
    buyAt: (post: string) => `Beli di ${post}`,
    owned: "Sudah",
    partWhere: (price: number, post: string) => `${price} emas · ${post}`,
    postOff: "pos tidak aktif",
    nextStep: "Langkah berikutnya",
    items: "Barang",
    flag: (left: number) => `Bendera Bajak Laut: sisa ${left} raid`,
    noFlag: "Belum punya Bendera Bajak Laut",
    itemWhere: (price: number, post: string) => `${price} emas · ${post}`,
    itemHelp: {
      flag: (raids: number) => `Bisa merampok ${raids} kali.`,
      sword: (bonus: number) => `+${bonus} pada dadu di setiap raid. Permanen.`,
      shield: "Menahan 1 raid berikutnya, lalu habis.",
    },
    sword: (bonus: number) => `Pedang: +${bonus} pada dadu di setiap raid (permanen)`,
    noSword: "Belum punya Pedang",
    shield: "Perisai: menahan 1 raid berikutnya",
    noShield: "Belum punya Perisai",
    doubleTitle: "Untung Ganda",
    doubleOff: "Pakai Untung Ganda pada pekerjaan lulus atau raid menang berikutnya",
    doubleOn: "UNTUNG GANDA SIAP. Ketuk untuk mematikan.",
    doubleUsed: "Untung Ganda sudah dipakai.",
    posts: "Pos",
    jobsLeft: (left: number, total: number) => `Sisa pekerjaan: ${left}/${total}`,
    free: "Kosong",
    busy: "Sibuk",
    servingYou: "Melayani kamu",
    waiting: (n: number) => `${n} menunggu`,
    challengeTitle: (post: string) => `Tantangan di ${post}`,
    journey: "Catatan perjalanan",
    noJourney: "Ceritamu dimulai di sini.",
    safeFor: (time: string) => `Kamu aman dari raid selama ${time}.`,
    myCode: "Kode raid saya",
    showCode: "Tampilkan kode",
    hideCode: "Sembunyikan",
    codeHint: "Jika tim bajak laut merampokmu, kamu harus menunjukkan kode ini.",
  },

  raid: {
    button: (left: number) => `Raid! (sisa ${left})`,
    title: "Rampok tim",
    pickTarget: "Tim mana yang kamu rampok?",
    safe: (time: string) => `Aman ${time}`,
    maxed: "Terlalu sering dirampok",
    typeCode: (team: string) => `Minta kode raid ${team} dan ketik di sini.`,
    go: "Raid!",
    back: "Kembali",
    rolling: "Mengocok dadu…",
    you: "Kamu",
    sword: (bonus: number) => `+${bonus} Pedang`,
    tieRule: "Seri = bertahan menang. Pedang juga menambah dadu tim yang bertahan.",
    win: (amount: number) => `Menang! Kamu mengambil ${amount} emas.`,
    loss: "Kamu kalah. Tidak dapat emas.",
    blocked: (team: string) => `${team} punya Perisai. Raid ditahan.`,
    defWin: (team: string) => `${team} merampokmu, tapi kamu menang!`,
    defLoss: (team: string, amount: number) => `${team} merampokmu dan mengambil ${amount} emas!`,
    defBlocked: (team: string) => `${team} merampokmu. Perisaimu menahannya!`,
    raidedTitle: "RAID!",
    extras: (doubled: boolean, pirateHour: boolean, bounty: boolean) =>
      [doubled && "Untung Ganda!", pirateHour && "Jam Bajak Laut!", bounty && "Hadiah Buronan!"].filter(Boolean).join(" "),
    close: "OK",
    lockTitle: "TERKUNCI!",
    lockBody: (team: string) => `${team} merampokmu. Berikan kode ini kepada mereka.`,
    lockHint: "Kamu tidak bisa ke pos mana pun sampai mereka melepasmu dengan kode ini.",
    unlockTitle: "Lepaskan tawanan",
    unlockHint: "Ketik kode yang ditampilkan di HP tim yang kamu rampok.",
    unlockGo: "Lepaskan",
    unlockOk: (team: string) => `${team} sudah dilepas.`,
    unlockAfterWin: "Mereka terkunci. Minta kode OTP mereka lalu lepaskan di sini.",
  },

  post: {
    pickTeam: "Ketuk sebuah tim",
    jobsHere: (done: number, total: number) => `Pekerjaan di sini: ${done}/${total}`,
    doubleArmed: "UNTUNG GANDA SIAP",
    pass: (amount: number) => `Lulus (+${amount})`,
    fail: (amount: number) => `Gagal (+${amount})`,
    passReady: "Lulus",
    failReady: "Gagal",
    sell: "Jual",
    jobsUsed: "Pekerjaan habis",
    jobsUsedHint: (total: number) => `Tim ini sudah ${total}/${total} pekerjaan di pos ini.`,
    tagFlag: (left: number) => `Bendera · sisa ${left} raid`,
    tagSword: "Pedang",
    tagShield: "Perisai",
    stock: (n: number) => `Sisa ${n}`,
    buy: (price: number) => `Harga ${price}`,
    serving: (team: string) => `Melayani: ${team}`,
    notServing: "Melayani: tidak ada",
    done: "Selesai",
    waiting: "Antrian",
    undo: (what: string, left: string) => `Batalkan: ${what} (${left})`,
    startTimer: (secs: number) => `Mulai timer (${secs} dtk)`,
    restartTimer: (secs: number) => `Ulangi timer (${secs} dtk)`,
    toastJob: (team: string, amount: number, doubled: boolean, goldRush?: boolean) => {
      const extra = [doubled && "Untung Ganda!", goldRush && "Gold Rush!"].filter(Boolean).join(" ");
      return `${team} +${amount} emas${extra ? ` (${extra})` : ""}`;
    },
    toastBuy: (team: string, item: string, price: number) => `${team} membeli ${item} seharga ${price} emas`,
    toastUndo: "Dibatalkan.",
    reason: {
      owned: "Sudah punya",
      noStock: "Stok habis",
      gold: (short: number) => `Kurang ${short}`,
      shield: "Sudah punya satu",
      closed: "Tidak sekarang",
      raidLocked: "Tim terkunci (raid)",
    },
  },

  mc: {
    ready: "Siap",
    unready: "Kembali ke persiapan",
    start: "Mulai permainan",
    pause: "Jeda",
    resume: "Lanjut",
    lastCall: "Last Call",
    end: "Akhiri permainan",
    confirmEnd: "Akhiri permainan sekarang? Skor akan final.",
    timeForLastCall: "Waktunya Last Call!",
    timeToEnd: "Waktunya mengakhiri permainan",
    nextEvent: "Acara berikutnya",
    noNextEvent: "Tidak ada acara terjadwal lagi.",
    atMinute: (m: number) => `di menit ${m}`,
    atClock: (clock: string) => `pada ${clock}`,
    dueNow: "Saatnya sekarang",
    scoreHow: "Cara hitung poin",
    scoreHowBody: (s: {
      parts_points: number;
      boat_points: number;
      finish_points: number;
      gold_points: number;
      raid_points: number;
      most_raids_points: number;
      total: number;
    }) =>
      [
        `Bagian ${s.parts_points}`,
        s.boat_points ? `kapal ${s.boat_points}` : null,
        s.finish_points ? `finis ${s.finish_points}` : null,
        `emas ${s.gold_points}`,
        s.raid_points ? `raid ${s.raid_points}` : null,
        s.most_raids_points ? `raid terbanyak ${s.most_raids_points}` : null,
        `= ${s.total}`,
      ]
        .filter(Boolean)
        .join(" · "),
    inPlay: "Main",
    parked: "Tidak main",
    fireNow: "Picu sekarang",
    fired: "Sudah dipicu",
    schedule: "Jadwal",
    autoFire: "Otomatis picu acara terjadwal",
    events: "Acara",
    fire: "Picu",
    stop: "Stop",
    running: "Sedang berjalan",
    messagePlaceholder: "Pesan khusus untuk semua HP",
    send: "Kirim",
    priceDial: "Dial harga",
    dialOff: "Mati",
    dialDown: (p: number) => `−${p}%`,
    dialUp: (p: number) => `+${p}%`,
    teams: "Tim",
    col: {
      team: "Tim",
      gold: "Emas",
      parts: "Bagian",
      items: "Barang",
      raids: "Sisa raid",
      wins: "Menang raid",
      raided: "Dirampok",
      safe: "Aman",
      boat: "Kapal",
    },
    tapToAdjust: "Ketuk tim untuk memperbaiki angka.",
    adjustTitle: (team: string) => `Perbaiki ${team}`,
    adjustGold: "Ubah emas sebesar",
    reason: "Alasan (wajib)",
    reasonPlaceholder: "Kenapa? mis. pos menekan tim yang salah",
    save: "Simpan",
    stockAndPosts: "Stok dan pos",
    stock: "Stok",
    jobs: "Pekerjaan per tim",
    serving: "Melayani",
    waiting: "Antrian",
    pace: "Cek tempo",
    paceParts: (n: number) => `Bagian terbeli sejauh ini: ${n}`,
    paceAt: (minute: string, normal: number) => `Di menit ${minute} kita harapkan sekitar ${normal}.`,
    paceOn: "Sesuai tempo",
    paceSlow: "Lambat: pertimbangkan dial harga",
    paceFast: "Cepat: minta pos memakai timer penuh",
    paceWait: "Cek tempo mulai di menit 20.",
    paceAllDone: "Semua kapal sudah selesai. Cek tempo berhenti.",
    paceScaled: (teams: number) => `Disesuaikan untuk ${teams} tim aktif.`,
    feed: "Umpan aktivitas",
    noFeed: "Belum ada.",
    links: { setup: "Pengaturan", lobby: "HP", qr: "Kode QR", tv: "Layar TV" },
    rehearsal: "Latihan",
    rehearsalHint: "Hanya latihan. Jam berjalan 4× lebih cepat. Nyalakan sebelum Mulai.",
    rehearsalOnLocked: "Latihan aktif: jam berjalan 4× lebih cepat. Tidak bisa diubah setelah Mulai.",
    rehearsalOffLocked: "Permainan berjalan normal. Latihan hanya bisa diubah sebelum Mulai.",
    postGame: "Selanjutnya?",
    postGameHint: "Setelah pengumuman selesai, tutup sesi atau mulai ulang.",
    closeGame: "Tutup permainan",
    closeGameHint: "Membersihkan permainan ini. Semua HP dan TV akan keluar.",
    confirmClose: "Tutup permainan untuk semua orang? HP akan keluar dan permainan dihapus.",
    restartGame: "Mulai ulang",
    restartGameHint: "Membersihkan data permainan dan mengeluarkan HP tim/pos, lalu kembali ke pengaturan.",
    confirmRestart: "Mulai ulang dari pengaturan? HP tim dan pos akan keluar. Login MC tetap.",
  },

  rehearsal: {
    badge: "LATIHAN · jam 4× lebih cepat",
  },

  scores: {
    points: "Poin",
    place: (n: number) => (n === 1 ? "ke-1" : n === 2 ? "ke-2" : n === 3 ? "ke-3" : `ke-${n}`),
    breakdown: (s: { parts: number; gold: number; raid_wins: number; boat_rank: number | null }) =>
      [
        `${s.parts}/4 bagian`,
        s.boat_rank ? `kapal #${s.boat_rank}` : null,
        `${s.gold} emas`,
        s.raid_wins ? `${s.raid_wins} menang raid` : null,
      ]
        .filter(Boolean)
        .join(" · "),
  },

  reveal: {
    title: "VOYAGE TERAKHIR",
    waiting: "Siapa yang sampai pulau duluan?",
    winner: (team: string) => `${team} juara!`,
    scoresTitle: "Skor akhir",
    scoresWaiting: "Menunggu MC memulai pengumuman…",
    mcTitle: "Pengumuman akhir",
    mcHint: "Akhiri permainan dulu. Lalu mulai pengumuman dan ketuk Berikutnya untuk tiap peringkat, dari terakhir ke juara.",
    start: "Mulai pengumuman",
    next: (place: string) => `Umumkan peringkat ${place}`,
    back: "Kembali",
    done: "Semua peringkat sudah ditampilkan.",
    shown: (n: number, total: number) => `${n} dari ${total} peringkat ditampilkan`,
    confirmStart: "Mulai pengumuman? Skor akan dikunci dan angka tidak bisa diperbaiki lagi.",
  },

  tv: {
    notFound: "Tidak ada permainan dengan kode ini.",
    boats: "Kapal selesai",
    noBoats: "Belum ada kapal yang selesai.",
    feed: "Di laut",
    scores: "Skor",
    scoresHidden: "Skor rahasia sampai akhir!",
    showScores: "Tampilkan skor di TV",
  },

  events: {
    gold_rush: "Gold Rush",
    storm: "Badai",
    supply_ship: "Kapal Pasokan",
    lighthouse_aid: "Bantuan Mercusuar",
    market_sale: "Obralan Pasar",
    pirate_hour: "Jam Bajak Laut",
    bounty: "Hadiah Buronan",
    message: "Pesan",
    last_call: "Last Call",
  } as Record<string, string>,

  storm: {
    title: "BADAI!",
    body: "Cari perlindungan di pos. Tidak ada yang boleh kerja, beli, atau raid.",
    wait: (time: string) => `Tunggu ${time}`,
  },

  errors: {
    BAD_TOKEN: () => "Kode QR ini tidak berlaku. Minta bantuan MC.",
    NOT_STARTED: () => "Permainan belum dimulai.",
    PAUSED: () => "Permainan sedang dijeda.",
    GAME_OVER: () => "Permainan sudah selesai.",
    STORM: (a) => `Badai! Tunggu ${clockText(Number(a.seconds_left ?? 0))}.`,
    LAST_CALL: () => "Last Call. Tidak ada raid lagi.",
    BAD_STATE: () => "Kamu tidak bisa melakukan itu sekarang.",
    JOB_LIMIT: (a) => `${a.team} sudah melakukan ${a.limit} pekerjaan di sini.`,
    NO_STOCK: (a) =>
      a.supply_minute
        ? `Stok ${itemName(a.item)} habis. Kapal Pasokan membawa lagi di menit ${a.supply_minute}.`
        : `Stok ${itemName(a.item)} habis.`,
    NOT_ENOUGH_GOLD: (a) => `${a.team} butuh ${a.need} emas. Mereka punya ${a.have}.`,
    ALREADY_OWNED: (a) => `${a.team} sudah punya ${itemName(a.item)}.`,
    HAS_SHIELD: (a) => `${a.team} sudah punya Perisai.`,
    WRONG_POST: () => "Barang itu tidak dijual di sini.",
    NOTHING_TO_UNDO: () => "Tidak ada yang bisa dibatalkan. Batalkan berlaku 2 menit.",
    UNDO_NO_GOLD: (a) => `${a.team} sudah memakai emas itu. Minta MC memperbaiki.`,
    UNDO_FLAG_USED: (a) => `${a.team} sudah memakai raid. Minta MC memperbaiki.`,
    UNDO_SHIELD_USED: (a) => `${a.team} sudah memakai Perisai. Minta MC memperbaiki.`,
    DOUBLE_USED: () => "Untung Ganda sudah dipakai.",
    OWN_TEAM: () => "Kamu tidak bisa merampok tim sendiri.",
    NO_RAIDS: () => "Kamu butuh Bendera Bajak Laut dengan sisa raid.",
    WRONG_CODE: (a) =>
      `Kode salah. Sisa ${a.tries_left} percobaan sebelum menunggu 30 detik.`,
    RAID_BLOCKED: (a) => `Terlalu banyak kode salah. Tunggu ${clockText(Number(a.seconds_left ?? 0))}.`,
    DEFENDER_SAFE: (a) => `${a.team} aman selama ${clockText(Number(a.seconds_left ?? 0))} lagi.`,
    MAX_RAIDED: (a) => `${a.team} terlalu sering dirampok. Pilih tim lain.`,
    NOTHING_TO_STEAL: (a) => `${a.team} tidak punya emas. Tidak ada yang dicuri. Raid tidak terpakai.`,
    RAID_LOCKED: (a) => `${a.team} masih terkunci setelah raid. Minta penyerang melepas mereka.`,
    WRONG_UNLOCK_CODE: () => "Kode buka kunci salah.",
    ALREADY_FIRED: () => "Acara itu sudah dipicu.",
    NO_SALE_PART: () => "Tidak ada bagian yang bisa diobral sekarang.",
    NOTHING_TO_STOP: () => "Acara itu sudah selesai.",
    NEGATIVE_GOLD: (a) => `${a.team} hanya punya ${a.have} emas.`,
    NEED_REASON: () => "Tolong tulis alasan.",
    REVEAL_LOCKED: () => "Pengumuman akhir sudah dimulai. Skor terkunci.",
    REHEARSAL_LOCKED: () => "Nyalakan atau matikan latihan sebelum permainan dimulai. Reset untuk mengubahnya.",
    NOT_ENDED: () => "Akhiri permainan dulu.",
    BAD_PASSWORD: () => "Kata sandi salah.",
    GAME_NOT_FOUND: () => "Permainan tidak ditemukan. Cek kodenya dengan MC.",
    WRONG_PIN: (a) =>
      `PIN salah. Sisa ${a.tries_left} percobaan.`,
    RATE_LIMITED: (a) => `Terlalu banyak percobaan. Tunggu ${clockText(Number(a.seconds_left ?? 0))}.`,
    LOGIN_CHANGED: () => "Login kamu diubah oleh MC. Minta PIN baru.",
    NOT_ALLOWED: () => "HP kamu tidak boleh melakukan ini.",
    BAD_INPUT: () => "Ada yang salah dengan input itu.",
    SETUP_LOCKED: () => "Permainan sudah dimulai. Pengaturan terkunci.",
    CONFIG_LOCKED: () => "Angka terkunci setelah Siap. Kembali ke pengaturan untuk mengubah.",
    IN_PROGRESS: () => "Masih diproses. Coba lagi sebentar.",
    NETWORK: () => "Tidak ada koneksi. Coba lagi.",
    SERVER_ERROR: () => "Ada yang salah. Coba lagi.",
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

export function journeyLine(a: Action): string {
  const post = String(a.details.post_name ?? "pos");
  switch (a.kind) {
    case "job_pass": {
      let extra = "";
      if (a.details.doubled) extra += " Untung Ganda!";
      if (a.details.gold_rush) extra += " Gold Rush!";
      return `Lulus pekerjaan di ${post}. +${a.amount} emas.${extra}`;
    }
    case "job_fail":
      return `Mencoba pekerjaan di ${post}. +${a.amount} emas.`;
    case "buy":
      return `Membeli ${itemName(a.item)} di ${post}. −${Math.abs(a.amount)} emas.`;
    case "boat_done":
      return `Kapalmu selesai! Peringkat ${a.details.rank}.${Number(a.details.bonus) > 0 ? ` Bonus finis +${a.details.bonus} poin.` : ""}`;
    case "undo":
      return `${post} membatalkan aksi terakhir. ${signed(a.amount)} emas.`;
    case "double_on":
      return "Untung Ganda siap.";
    case "double_off":
      return "Untung Ganda dimatikan.";
    case "raid": {
      const other = String(a.details.other);
      if (a.details.result === "win") return `Merampok ${other} dan menang! +${a.amount} emas.${a.details.doubled ? " Untung Ganda!" : ""}`;
      if (a.details.result === "blocked") return `Merampok ${other}, tapi Perisai mereka menahannya.`;
      return `Merampok ${other} dan kalah.`;
    }
    case "raided": {
      const other = String(a.details.other);
      if (a.details.result === "win") return `${other} merampokmu dan mengambil ${Math.abs(a.amount)} emas.`;
      if (a.details.result === "blocked") return `${other} merampokmu. Perisaimu menahannya.`;
      return `${other} merampokmu, tapi kamu menang.`;
    }
    case "raid_unlock":
      return "Kamu dilepas dari kunci raid.";
    case "lighthouse":
      return `Bantuan Mercusuar! +${a.amount} emas.`;
    case "adjust":
      return a.details.field === "gold"
        ? `MC mengubah emasmu: ${signed(a.amount)}. (${a.details.reason})`
        : `MC memperbaiki ${fieldName(a.details.field)}. (${a.details.reason})`;
    default:
      return a.amount ? `${signed(a.amount)} emas.` : a.kind;
  }
}

export function feedLine(a: Action, team: string): string | null {
  const post = String(a.details.post_name ?? "pos");
  switch (a.kind) {
    case "job_pass":
      return `${team} lulus pekerjaan di ${post}. +${a.amount} emas.`;
    case "job_fail":
      return `${team} mencoba pekerjaan di ${post}. +${a.amount} emas.`;
    case "buy":
      return `${team} membeli ${itemName(a.item)}.`;
    case "boat_done":
      return `${team} menyelesaikan kapal! Peringkat ${a.details.rank}.`;
    case "undo":
      return `${post} membatalkan aksi untuk ${team}.`;
    case "raid": {
      const other = String(a.details.other);
      if (a.details.result === "win") return `${team} merampok ${other} dan mengambil ${a.amount} emas!`;
      if (a.details.result === "blocked") return `${team} merampok ${other}, tapi Perisai menahannya!`;
      return `${team} merampok ${other} dan kalah!`;
    }
    case "raid_unlock":
      return `${a.details.other ?? "?"} melepas ${a.details.team}.`;
    case "lighthouse":
      return `${team} mendapat Bantuan Mercusuar. +${a.amount} emas.`;
    case "adjust":
      return a.details.field === "gold"
        ? `MC: emas ${team} ${signed(a.amount)} (${a.details.reason})`
        : `MC: ${team} ${fieldName(a.details.field)} = ${a.details.value} (${a.details.reason})`;
    default:
      return null;
  }
}

const FIELD_NAMES: Record<string, string> = {
  gold: "emas",
  raids_left: "sisa raid",
  raid_wins: "menang raid",
  shield_count: "Perisai",
  has_hull: "Lambung",
  has_mast: "Tiang",
  has_sail: "Layar",
  has_map: "Peta",
  has_flag: "Bendera Bajak Laut",
  has_sword: "Pedang",
};

export function fieldName(field: unknown): string {
  return FIELD_NAMES[String(field)] ?? String(field);
}

export function eventName(kind: string): string {
  return copy.events[kind] ?? kind;
}

export function stripText(e: WorldEvent): string {
  const p = e.payload;
  switch (e.kind) {
    case "gold_rush":
      return `Gold Rush: bonus +${p.bonus} emas untuk tiap pekerjaan lulus (Untung Ganda menggandakannya)`;
    case "storm":
      return "Badai: tidak ada yang boleh kerja, beli, atau raid";
    case "market_sale":
      return `Obralan Pasar: ${itemName(p.part)} −${p.discount} emas`;
    case "pirate_hour":
      return `Jam Bajak Laut: raid menang mencuri ×${p.multiplier}`;
    case "bounty":
      return `Hadiah Buronan pada ${joinNames((p.teams as string[]) ?? [])}: +${p.bonus} emas`;
    default:
      return eventName(e.kind);
  }
}

export function priceDialText(percent: number) {
  return percent < 0 ? `Bagian ${percent}%` : `Bagian +${percent}%`;
}

export type Banner = { title: string; body: string; tone: "good" | "bad" | "info"; big?: boolean };

export function bannerFor(e: WorldEvent): Banner | null {
  const p = e.payload;
  switch (e.kind) {
    case "boat_finished": {
      const rank = Number(p.rank);
      const place = rank === 1 ? "Pertama sampai pulau!" : `Peringkat ${rank}.`;
      const bonus = Number(p.bonus) > 0 ? ` Bonus finis +${p.bonus} poin (bukan emas).` : "";
      return { title: "KAPAL SELESAI!", body: `${p.team} sudah membangun kapal! ${place}${bonus}`, tone: "good", big: true };
    }
    case "last_call":
      return {
        title: "LAST CALL",
        body: "Tidak ada raid lagi. Pos hanya melayani tim yang sudah antre.",
        tone: "info",
      };
    case "end":
      return { title: "DARATAN!", body: "Permainan selesai. Skor ada di HP-mu.", tone: "info" };
    case "gold_rush":
      return {
        title: "GOLD RUSH!",
        body: `Setiap pekerjaan lulus mendapat bonus +${p.bonus} emas di atas bayaran biasa. Untung Ganda menggandakan bonus itu. Buruan!`,
        tone: "good",
      };
    case "storm":
      return { title: "BADAI!", body: "Cari perlindungan di pos. Tidak ada yang boleh kerja atau raid.", tone: "bad" };
    case "supply_ship":
      return { title: "KAPAL PASOKAN!", body: `Kapal pasokan datang! +${p.add} setiap bagian.`, tone: "good" };
    case "lighthouse_aid": {
      const names = (p.teams as string[]) ?? [];
      return {
        title: "BANTUAN MERCUSUAR",
        body: `${joinNames(names)} mendapat ${p.amount} emas (bantuan untuk tim dengan emas paling sedikit).`,
        tone: "good",
      };
    }
    case "market_sale":
      return { title: "OBRALAN PASAR!", body: `${itemName(p.part)} lebih murah ${p.discount} emas.`, tone: "good" };
    case "pirate_hour":
      return { title: "JAM BAJAK LAUT!", body: `Raid menang mencuri ${p.multiplier}× lebih banyak emas.`, tone: "bad" };
    case "bounty":
      return {
        title: "HADIAH BURONAN!",
        body: `Menangkan raid terhadap ${joinNames((p.teams as string[]) ?? [])} untuk +${p.bonus} emas.`,
        tone: "bad",
      };
    case "price_dial": {
      const pct = p.percent as number | null;
      if (pct === null) return { title: "HARGA NORMAL", body: "Harga bagian kembali normal.", tone: "info" };
      return pct < 0
        ? { title: "HARGA TURUN!", body: `Semua bagian lebih murah ${-pct}%.`, tone: "good" }
        : { title: "HARGA NAIK!", body: `Semua bagian lebih mahal ${pct}%.`, tone: "bad" };
    }
    case "message":
      return { title: "AHOY!", body: String(p.text), tone: "info" };
    default:
      return null;
  }
}

export const nextStepText = {
  notStarted: "Tunggu MC memulai permainan.",
  paused: "Permainan dijeda. Tunggu MC.",
  ended: "Permainan selesai. Peringkatmu ada di layar ini.",
  boatDone: (goldPerPoint: number) =>
    `Kapalmu selesai! Terus kumpulkan emas. Setiap ${goldPerPoint} emas = 1 poin.`,
  buy: (post: string, item: string, price: number) => `Pergi ke ${post} dan beli ${item} (${price} emas).`,
  earn: (need: number, item: string, posts: string[]) =>
    posts.length
      ? `Kamu butuh ${need} emas lagi untuk ${item}. ${joinNames(posts)} masih punya pekerjaan.`
      : `Kamu butuh ${need} emas lagi untuk ${item}. Tidak ada pekerjaan tersisa. Coba raid atau tunggu acara.`,
  noStock: (item: string) => `Stok ${item} habis sekarang. Kumpulkan emas dan tunggu Kapal Pasokan.`,
};

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} dan ${names[names.length - 1]}`;
}
