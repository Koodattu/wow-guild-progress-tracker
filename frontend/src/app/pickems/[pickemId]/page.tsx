import PickemsClient from "../PickemsClient";

export default async function PickemDetailPage({ params }: { params: Promise<{ pickemId: string }> }) {
  const { pickemId } = await params;

  return <PickemsClient initialPickemId={decodeURIComponent(pickemId)} />;
}
