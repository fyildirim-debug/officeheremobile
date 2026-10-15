// Düzenleme kipinde alt araç çubuğu: sık kullanılan biçimler doğrudan, ayrıntılar panellerde.
import type { Editor } from "@tiptap/core";
import {
  Checkmark24Regular,
  DocumentMargins24Regular,
  FontDecrease24Regular,
  FontIncrease24Regular,
  Highlight24Regular,
  Search24Regular,
  TextBold24Regular,
  TextBulletListLtr24Regular,
  TextBulletListTree24Regular,
  TextClearFormatting24Regular,
  TextColor24Regular,
  TextEditStyle24Regular,
  TextFont24Regular,
  TextIndentDecreaseLtr24Regular,
  TextIndentIncreaseLtr24Regular,
  TextItalic24Regular,
  TextNumberListLtr24Regular,
  TextStrikethrough24Regular,
  TextUnderline24Regular,
} from "@fluentui/react-icons";
import type { FormatState } from "@belge/editor/formatState";
import type { StyleDef } from "@belge/model/styles";
import { BottomToolbar, ToolButton } from "../shell/Toolbar";
import { bicimiTemizle, boyutAdim, girinti, isaretDegistir, isaretEtkin, liste, secimiEsitle } from "./komutlar";
import { secimKorumali } from "./koruma";
import { HIZALAR, type PanelId } from "./Paneller";

interface Props {
  editor: Editor;
  fmt: FormatState;
  styles: Record<string, StyleDef>;
  panel: PanelId | null;
  onPanel: (p: PanelId) => void;
  onBul: () => void;
  onBitir: () => void;
  /** Komut uygulanamadı (seçim korunan nesnede). */
  onEngel: () => void;
}

/** Renk şeritli simge (yazı rengi, vurgu). */
function Renkli({ icon, renk }: { icon: React.ReactNode; renk: string | null }) {
  return (
    <span className="m-belge-renkli">
      {icon}
      <i style={{ background: renk ?? "currentColor" }} />
    </span>
  );
}

export function AracCubugu({ editor, fmt, styles, panel, onPanel, onBul, onBitir, onEngel }: Props) {
  // Seçim yalnız korunan nesnedeyse (tablo içi vb.) uygulanmaz, bildirilir.
  const yap = (fn: () => unknown) => {
    secimiEsitle(editor);
    if (secimKorumali(editor.state)) onEngel();
    else fn();
  };
  const hiza = HIZALAR.find((h) => h.id === fmt.align) ?? HIZALAR[0];
  return (
    <BottomToolbar label="Biçimlendirme">
      <span className="m-belge-bitir">
        <ToolButton icon={<Checkmark24Regular />} label="Düzenlemeyi bitir" onClick={onBitir} />
      </span>
      <span className="m-belge-tb-ayrac" aria-hidden />
      <ToolButton icon={<TextEditStyle24Regular />} label="Stiller" active={panel === "stil"} onClick={() => onPanel("stil")} />
      <ToolButton icon={<TextFont24Regular />} label="Yazı tipi" active={panel === "yazi"} onClick={() => onPanel("yazi")} />
      <ToolButton icon={<FontDecrease24Regular />} label="Yazı tipini küçült" onClick={() => yap(() => boyutAdim(editor, styles, -1))} />
      <ToolButton icon={<FontIncrease24Regular />} label="Yazı tipini büyült" onClick={() => yap(() => boyutAdim(editor, styles, 1))} />
      <span className="m-belge-tb-ayrac" aria-hidden />
      <ToolButton icon={<TextBold24Regular />} label="Kalın" active={fmt.bold} onClick={() => yap(() => isaretDegistir(editor, "bold", isaretEtkin(editor, "bold")))} />
      <ToolButton icon={<TextItalic24Regular />} label="İtalik" active={fmt.italic} onClick={() => yap(() => isaretDegistir(editor, "italic", isaretEtkin(editor, "italic")))} />
      <ToolButton icon={<TextUnderline24Regular />} label="Altı çizili" active={!!fmt.underline} onClick={() => yap(() => isaretDegistir(editor, "underline", isaretEtkin(editor, "underline")))} />
      <ToolButton icon={<TextStrikethrough24Regular />} label="Üstü çizili" active={fmt.strike} onClick={() => yap(() => isaretDegistir(editor, "strike", isaretEtkin(editor, "strike")))} />
      <ToolButton icon={<Renkli icon={<TextColor24Regular />} renk={fmt.color} />} label="Yazı tipi rengi" active={panel === "renk"} onClick={() => onPanel("renk")} />
      <ToolButton icon={<Renkli icon={<Highlight24Regular />} renk={fmt.highlight ?? "transparent"} />} label="Metin vurgu rengi" active={panel === "vurgu"} onClick={() => onPanel("vurgu")} />
      <span className="m-belge-tb-ayrac" aria-hidden />
      <ToolButton icon={<TextBulletListLtr24Regular />} label="Madde işaretleri" active={fmt.list === "bullet"} onClick={() => yap(() => liste(editor, "bulletList"))} />
      <ToolButton icon={<TextNumberListLtr24Regular />} label="Numaralandırma" active={fmt.list === "ordered"} onClick={() => yap(() => liste(editor, "orderedList"))} />
      <ToolButton icon={hiza.icon} label="Paragraf ve hizalama" active={panel === "paragraf"} onClick={() => onPanel("paragraf")} />
      <ToolButton icon={<TextIndentDecreaseLtr24Regular />} label="Girintiyi azalt" onClick={() => yap(() => girinti(editor, -1))} />
      <ToolButton icon={<TextIndentIncreaseLtr24Regular />} label="Girintiyi artır" onClick={() => yap(() => girinti(editor, 1))} />
      <ToolButton icon={<TextClearFormatting24Regular />} label="Biçimi temizle" onClick={() => yap(() => bicimiTemizle(editor))} />
      <span className="m-belge-tb-ayrac" aria-hidden />
      <ToolButton icon={<DocumentMargins24Regular />} label="Sayfa yapısı" active={panel === "sayfa"} onClick={() => onPanel("sayfa")} />
      <ToolButton icon={<TextBulletListTree24Regular />} label="Gezinti" active={panel === "gezinti"} onClick={() => onPanel("gezinti")} />
      <ToolButton icon={<Search24Regular />} label="Bul ve değiştir" onClick={onBul} />
    </BottomToolbar>
  );
}
