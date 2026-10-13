// Son kullanılan dosya için seçenekler paneli (aç, sabitle, listeden kaldır).
import { Delete24Regular, Open24Regular, Pin24Regular, PinOff24Regular } from "@fluentui/react-icons";
import type { RecentFile } from "../platform";
import { useBackHandler } from "../shell/back";
import { Sheet } from "../shell/Toolbar";

interface Props {
  file: RecentFile | null;
  onClose: () => void;
  onOpen: (f: RecentFile) => void;
  onPin: (f: RecentFile, pinned: boolean) => void | Promise<void>;
  onRemove: (f: RecentFile) => void | Promise<void>;
}

export function RecentActions({ file, onClose, onOpen, onPin, onRemove }: Props) {
  useBackHandler(onClose, !!file);
  const run = (fn: (f: RecentFile) => void | Promise<void>) => () => {
    if (!file) return;
    onClose();
    void fn(file);
  };
  return (
    <Sheet open={!!file} title={file?.name ?? ""} onClose={onClose}>
      <div className="m-list">
        <button type="button" className="m-list-item" onClick={run(onOpen)}>
          <Open24Regular />
          <span>Aç</span>
        </button>
        <button type="button" className="m-list-item" onClick={run((f) => onPin(f, !f.pinned))}>
          {file?.pinned ? <PinOff24Regular /> : <Pin24Regular />}
          <span>{file?.pinned ? "Sabitlemeyi kaldır" : "Listeye sabitle"}</span>
        </button>
        <button type="button" className="m-list-item is-danger" onClick={run(onRemove)}>
          <Delete24Regular />
          <span>Listeden kaldır</span>
        </button>
      </div>
    </Sheet>
  );
}
