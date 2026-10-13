// Sunum ekranı (geçici iskelet; Sunum ajanı tarafından gerçek ekranla değiştirilecek).
import { AppBar } from "../shell/AppBar";
import type { DocScreenProps } from "../platform";

export default function SunumScreen({ doc, onClose }: DocScreenProps) {
  return (
    <div className="m-screen">
      <AppBar title={doc.name} onBack={onClose} />
      <main className="m-content" />
    </div>
  );
}
