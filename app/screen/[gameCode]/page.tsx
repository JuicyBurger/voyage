import { TvScreen } from "@/components/tv/tv-screen";

export default async function ScreenPage(props: PageProps<"/screen/[gameCode]">) {
  const { gameCode } = await props.params;
  return <TvScreen code={gameCode} />;
}
