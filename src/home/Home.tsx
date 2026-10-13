// Giriş ekranı (geçici iskelet; platform ajanı tarafından tamamlanacak).
import { AppBar } from "../shell/AppBar";
import { acceptFor, type AppKind, type OpenedDoc, type Platform } from "../platform";

interface Props {
  platform: Platform;
  onOpen: (d: OpenedDoc) => void;
  onError: (message: string) => void;
}

const NEW_NAMES: Record<AppKind, string> = { belge: "Belge1.docx", tablo: "Kitap1.xlsx", sunum: "Sunu1.pptx" };

export function Home({ platform, onOpen, onError }: Props) {
  const pick = async () => {
    try {
      const d = await platform.pickFile(acceptFor());
      if (d) onOpen(d);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <div className="m-screen">
      <AppBar title="OfficeHere" />
      <main className="m-content">
        {(["belge", "tablo", "sunum"] as AppKind[]).map((a) => (
          <button key={a} type="button" className="m-btn" onClick={() => onOpen({ name: NEW_NAMES[a], data: null, app: a })}>
            Yeni {a}
          </button>
        ))}
        <button type="button" className="m-btn is-primary" onClick={pick}>
          Aç
        </button>
      </main>
    </div>
  );
}
