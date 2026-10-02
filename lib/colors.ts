export const TEAM_COLORS: Record<string, { bg: string; soft: string; text: string }> = {
  red: { bg: "#dc2626", soft: "#fee2e2", text: "#ffffff" },
  blue: { bg: "#2563eb", soft: "#dbeafe", text: "#ffffff" },
  amber: { bg: "#d97706", soft: "#fef3c7", text: "#ffffff" },
  green: { bg: "#16a34a", soft: "#dcfce7", text: "#ffffff" },
  purple: { bg: "#9333ea", soft: "#f3e8ff", text: "#ffffff" },
  teal: { bg: "#0d9488", soft: "#ccfbf1", text: "#ffffff" },
  pink: { bg: "#db2777", soft: "#fce7f3", text: "#ffffff" },
  orange: { bg: "#ea580c", soft: "#ffedd5", text: "#ffffff" },
};

export function teamColor(name: string) {
  return TEAM_COLORS[name] ?? TEAM_COLORS.blue;
}
