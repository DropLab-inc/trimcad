import { Icon, type IconName } from './Icon'
import { useCadStore } from '../core/store'
import { useFileActions } from './useFileActions'

/** AutoCAD's quick access strip: the handful of commands worth a permanent button. */
export function QuickAccess() {
  const files = useFileActions()
  const undo = useCadStore((state) => state.undo)
  const redo = useCadStore((state) => state.redo)
  const cutSelection = useCadStore((state) => state.cutSelection)
  const copySelection = useCadStore((state) => state.copySelection)
  const pasteClipboard = useCadStore((state) => state.pasteClipboard)
  const hasSelection = useCadStore((state) => state.selectedIds.length > 0)
  const hasClipboard = useCadStore((state) => state.clipboard.length > 0)

  const buttons: Array<{ icon: IconName; label: string; title: string; run: () => void; disabled?: boolean }> = [
    { icon: 'new', label: 'New', title: 'New drawing (Ctrl+N)', run: files.newDrawing },
    { icon: 'open', label: 'Open', title: 'Open drawing (Ctrl+O)', run: () => void files.openDrawing() },
    { icon: 'save', label: 'Save', title: 'Save drawing (Ctrl+S)', run: files.saveDrawing },
    { icon: 'print', label: 'Plot', title: 'Print to PDF (Ctrl+P)', run: () => files.print('fit') },
    { icon: 'undo', label: 'Undo', title: 'Undo (Ctrl+Z)', run: undo },
    { icon: 'redo', label: 'Redo', title: 'Redo (Ctrl+Y)', run: redo },
    { icon: 'cut', label: 'Cut', title: 'Cut (Ctrl+X)', run: cutSelection, disabled: !hasSelection },
    {
      icon: 'clipboard-copy',
      label: 'Copy',
      title: 'Copy (Ctrl+C)',
      run: copySelection,
      disabled: !hasSelection,
    },
    { icon: 'paste', label: 'Paste', title: 'Paste (Ctrl+V)', run: pasteClipboard, disabled: !hasClipboard },
  ]

  return (
    <div className="quick-access">
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          className="quick-btn"
          title={button.title}
          aria-label={button.label}
          disabled={button.disabled}
          onClick={button.run}
        >
          <Icon name={button.icon} />
        </button>
      ))}
    </div>
  )
}
