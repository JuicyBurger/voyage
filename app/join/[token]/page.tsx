import { JoinScreen } from "./join-screen";

export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  return <JoinScreen token={token} />;
}
