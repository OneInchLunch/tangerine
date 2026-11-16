import {
  ArrowRightLeft,
  BookOpen,
  Boxes,
  Braces,
  CloudDownload,
  KeySquare,
  Layers,
  LayoutDashboard,
  ListChecks,
  Puzzle,
  Server,
  Share2,
  Signature,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";

/**
 * One icon per entity, shared by the sidebar, dashboard stat cards, page
 * headers, and row badges. Keeping the map unique prevents the Users/Groups
 * and Repositories/Package ambiguity where two similar glyphs meant different
 * things. Action icons (add, edit, delete, refresh, toggle) stay local to the
 * component because they describe verbs rather than entities.
 */
export const entityIcons = {
  dashboard: LayoutDashboard,
  repositories: Boxes,
  remotes: CloudDownload,
  distributions: Share2,
  publications: BookOpen,
  content: Layers,
  tasks: ListChecks,
  workers: Server,
  operations: Wrench,
  importExport: ArrowRightLeft,
  users: UserRound,
  groups: UsersRound,
  roles: KeySquare,
  signing: Signature,
  plugins: Puzzle,
  apiAdmin: Braces,
} as const;
