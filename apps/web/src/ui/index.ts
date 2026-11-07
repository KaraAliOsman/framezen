/**
 * Componentes base de DEKOPEN («Huincha», docs/DESIGN.md v3). Importa siempre desde aquí:
 *   import { Button, NumberField, StatusPill } from '../ui'
 * Íconos del rubro: import { IconOpeningTiltTurn } from '../ui/icons'
 */
export { AnimatedNumber, Flash } from './AnimatedNumber'
export { Avatar, type AvatarProps } from './Avatar'
export {
  Badge,
  StatusDot,
  StatusGlyph,
  StatusPill,
  QUOTE_STATUS_COPY,
  QUOTE_STATUS_ORDER,
  type BadgeProps,
  type BadgeTone,
  type StatusDotProps,
  type StatusPillProps,
  type StatusTone,
} from './Badge'
export { Button, buttonClass, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button'
export { Card, CardHeader, Panel, type CardProps, type PanelProps } from './Card'
export { Checkbox, type CheckboxProps } from './Checkbox'
export { ColorSwatch, ColorSwatchGroup, type ColorOption, type ColorSwatchProps } from './ColorSwatch'
export { Combobox, accentFilter, type ComboboxOption, type ComboboxProps } from './Combobox'
export { CommandPalette, type CommandAction, type CommandGroup, type CommandPaletteProps } from './CommandPalette'
export { DataTable, type DataTableColumn, type DataTableProps, type SortDir } from './DataTable'
export { Dialog, DialogClose, DialogContent, DialogTrigger, type DialogContentProps } from './Dialog'
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './DropdownMenu'
export { EmptyState, type EmptyStateProps, type EmptyWindowKind } from './EmptyState'
export { ErrorBoundary, ZoneError, type ErrorBoundaryFallbackProps, type ErrorBoundaryProps, type ZoneErrorProps } from './ErrorBoundary'
export { Field, Label, type FieldProps } from './Field'
export {
  DekopenLogo,
  DekopenMark,
  DekopenWordmark,
  type DekopenLogoProps,
  type DekopenMarkProps,
  type DekopenWordmarkProps,
  type LogoTone,
} from './DekopenLogo'
export { IconButton, type IconButtonProps } from './IconButton'
export {
  Inspector,
  InspectorFooter,
  InspectorHeader,
  InspectorRow,
  InspectorSection,
  type InspectorHeaderProps,
  type InspectorProps,
  type InspectorRowProps,
  type InspectorSectionProps,
} from './Inspector'
export { Input, Textarea, fieldClass, type InputProps, type TextareaProps } from './Input'
export { Kbd, KbdHint, shortcutKeys, useShortcutText, type KbdHintProps, type KbdProps } from './Kbd'
export { KPI, type KPIProps } from './KPI'
export { Meter, type MeterProps, type MeterTone } from './Meter'
export { MoneyField, formatMoneyInput, moneyShape, parseCLP, parseMoney, type MoneyFieldProps, type MoneyLocaleOptions } from './MoneyField'
export { Notice, type NoticeProps, type NoticeTone } from './Notice'
export {
  NumberField,
  decimalSeparator,
  measureInputText,
  normalizeNumberInput,
  parseMeasure,
  parseSize,
  type NumberFieldProps,
} from './NumberField'
export { Numeric, type NumericKind, type NumericProps } from './Numeric'
export { Page, PageHeader, type Crumb, type PageHeaderProps } from './PageHeader'
export { PageSection, RowTitle, StatStrip, type PageSectionProps, type RowTitleProps } from './PageSection'
export { PlanGate, UPGRADE_PATH, type PlanGateProps } from './PlanGate'
export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger, floatingClass, type PopoverContentProps } from './Popover'
export { RadioCards, type RadioCardOption, type RadioCardsProps } from './RadioCards'
export { SaveIndicator, type SaveIndicatorProps, type SaveStatus } from './SaveIndicator'
export { SegmentedControl, type SegmentOption, type SegmentedControlProps } from './SegmentedControl'
export { Select, type SelectOption, type SelectProps } from './Select'
export { Sheet, SheetClose, SheetContent, SheetTrigger, type SheetContentProps } from './Sheet'
export { Skeleton, SkeletonRows, SkeletonText } from './Skeleton'
export { Slider, type SliderProps } from './Slider'
export { Spinner } from './Spinner'
export { Switch, type SwitchProps } from './Switch'
export { Tabs, TabsContent, TabsList, TabsTrigger, type TabsListProps, type TabsTriggerProps, type TabsVariant } from './Tabs'
export { Toaster, toast, toastUndo, useToastArea, TOAST_DURATION, TOP_TOAST_GAP, UNDO_DURATION, type UndoToastOptions } from './Toaster'
export { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator, ToolbarSpacer, ToolbarTitle, type ToolbarProps, type ToolbarTitleProps } from './Toolbar'
export { Tooltip, TooltipProvider, type TooltipProps } from './Tooltip'
export { WindowSketch, type SketchKind, type WindowSketchProps } from './WindowSketch'
