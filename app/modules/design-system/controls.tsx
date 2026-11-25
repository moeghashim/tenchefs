/**
 * The design system's controls: buttons, forms, fields, boxes and dialogs (`layout.tsx` has the design system as a whole).
 *
 * - `PressButton` is a button that is on or off.
 * - `ChoiceGroup` is a radio group of a few choices.
 * - `DividerButton` is a divider line led by a quiet button, such as one that shows the replies folded under it.
 * - `LineForm` is a named form of one labelled line of text, whose text its owner holds, with a Save button (disabled while saving; `submit` names its button, `Save` unless given) and anything under it, such as an `Alert`; with `submitLast` the button comes after what is under it, so Tab reaches a field there first.
 * - `AreaForm` is `LineForm`'s form of a few growing lines of text, up to `limit` characters shown as a counter, where Enter starts a new line and Ctrl/Cmd+Enter saves.
 * - `ActionGroup` is a named group of what can be done to one thing.
 * - `ButtonRow` puts buttons side by side. A `Button` (and a `HeadingButton`) takes focus whenever `focused` turns true, such as when it appears.
 * - `TokenText` shows a secret, such as a fresh token, to copy.
 * - `ConfirmDialog` asks before an action, in a modal shadcn AlertDialog on Radix's primitives (ADR 0080), the one part built on a library: its title, a body naming exactly what happens, Cancel and a confirm button, in the destructive colour when the action can't be undone. It holds focus inside while open, Escape or Cancel calls `onCancel`, and focus goes back to what opened it when it closes. While `pending` both buttons are disabled and the confirm button says so; an `error` shows inside it. Its owner decides when it is `open`, so it never closes.
 * - `FormDialog` is a Radix modal form.
 * - `RunList`.
 * - `FieldNote`.
 * - `MoreActions` is a three-dots menu button: the `hover` look (the default) for a message's hover bar, the `box` look for a message box's row, where it matches Send's size and place.
 * - `ShortcutList` is a Radix modal of keyboard shortcuts, each group a list named by its heading, each row what a shortcut does beside its keys; Escape calls `onClose`, and focus goes back to what was focused when it opened.
 * - `ListDialog` is a Radix modal of a list, titled and described, with a Close button (`close` its text); Escape or Close calls `onClose`, and focus goes back to what was focused when it opened.
 * - `FilterField` is a labelled box whose text its owner holds.
 * - `Chip` is a button, pressed or not.
 * - `QuietButton` is a muted centred button, naming what it `controls`, such as loading older messages.
 * - `Form` hands one field's value to `onSubmit` without reloading the page.
 * - `TextField` is a labelled secret input in a `Form`, such as a token. It takes focus when it first appears if `focused`.
 * - `TextArea` is a labelled box to write in, such as a reply, whose text and caret its owner holds, where Enter sends the form and Shift+Enter starts a new line, and, while its owner is `choosing` from suggestions, is a combobox naming the highlighted option as its active descendant, where the arrows move it, Enter or Tab picks it and Escape closes the list. It takes focus when it first appears if `focused`, and puts the caret at the end of any text it appears with. Files pasted into it go to `onPasteFiles` instead of the text; it needs text to send only while `required`.
 * - `SubmitButton` sends a `Form`.
 * - `SendButton` is its paper-plane icon form, named and tooltipped by `label`.
 * - `AttachButton` is a paperclip icon button, named and tooltipped by `label`, that opens the file picker for several files and hands what is picked to `onFiles`.
 * - `FileDrop` hands files dropped anywhere on its children to `onFiles`; anything else dropped is left alone.
 * - `PendingList` is a box's named list of files waiting to be sent, above its text, each in a `PendingItem`: its children (a thumbnail or a chip) with a small remove button named by `removeLabel` at its corner.
 * - `Suggestions` is a named listbox of options under a box, such as mentions or commands (each with any muted detail), one selected, which leaves the box focused even when a pointer picks one; it floats above the box (or below it, with `place` `below`), out of its layout, over all in the pane.
 * - `ComboboxField` is a named search input (`box` its ID) that is a combobox controlling the listbox `list`, its option at `active` the active one while `expanded`.
 * - `Listbox` is the named listbox (`list` its ID) both draw, of options in optional named groups, drawn by its children, the one at `highlighted` selected (scrolled into view in the `results` look); pressing one calls `onChoose` with its `value`, leaving the box focused.
 * - `ResultOption` is a result's label, detail and children.
 * - `DataArea` is a labelled box to write JSON in, whose text its owner holds.
 * - `LinesArea` is an optional labelled box for lines (`name: value` headers), whose text its owner holds.
 * - `PromptForm` is a named card in place of a message box that asks for a command's data, titled, with a Cancel and a submit button, its first field focused. Its Escape is the keymap's: the view that draws it binds `cancelPrompt` to the form, named by its `label`.
 * - `InputField` is a labelled field in a `PromptForm` (text, a number, an integer, a date or a time) whose value its owner holds, marked when required, with its help text and any error under it, both read out as its description.
 * - `PickField` is an `InputField` for one of a list, or none.
 * - `CheckField` is an `InputField` for a checkbox.
 */
export {
  ActionGroup,
  ConfirmDialog,
  FormDialog,
  ShortcutList,
  ListDialog,
  FieldNote,
  RunList,
  MoreActions,
  ButtonRow,
  TokenText,
  QuietButton,
  Button,
  CheckField,
  ChoiceGroup,
  DataArea,
  LinesArea,
  Form,
  LineForm,
  AreaForm,
  InputField,
  DividerButton,
  PressButton,
  PickField,
  PromptForm,
  Suggestions,
  ComboboxField,
  Listbox,
  type ListboxGroup,
  type ListboxOption,
  ResultOption,
  SendButton,
  AttachButton,
  FileDrop,
  PendingItem,
  PendingList,
  SubmitButton,
  TextArea,
  TextField,
  Chip,
  FilterField,
} from "./lib/controls.ts";
