export type TextLibraryEntity = "subagents" | "skills" | "bootstrap";

export type TextLibraryBadge = {
  className?: string;
  text: string;
};

export type TextLibraryDraft = {
  content: string;
  id: string;
};

export type TextLibraryItem = {
  cardBadges: TextLibraryBadge[];
  content: string;
  detailBadges: TextLibraryBadge[];
  id: string;
  path: string;
  summary: string;
};

export type TextLibraryUiDefinition = {
  closeDeleteLabel: string;
  closeModalLabel: string;
  closePanelLabel: string;
  contentLabel: string;
  contentTitle: string;
  createDescription: string;
  createEyebrow: string;
  createSubmitLabel: string;
  createSubmittingLabel: string;
  createSuccessLabel: string;
  createTitle: string;
  deleteDescription: (item: TextLibraryItem) => string;
  deleteEyebrow: string;
  deleteSubmitLabel: string;
  deleteSubmittingLabel: string;
  deleteSuccessLabel: string;
  deleteTitle: (item: TextLibraryItem) => string;
  detailsEyebrow: string;
  editEyebrow: string;
  editSubmitLabel: string;
  editSubmittingLabel: string;
  emptyDescription: string;
  emptySummaryLabel: string;
  emptyTitle: string;
  idLabel: string;
  idPlaceholder?: string;
  inspectorEmptyDescription: string;
  inspectorEmptyTitle: string;
  loadingItemLabel: string;
  loadingListLabel: string;
  newLabel: string;
  profileMissingDescription?: (profileId: string) => string;
  refreshLabel: string;
  searchHint: string;
  searchPlaceholder: string;
  summaryTitle: string;
  surfaceDescription: string;
  surfaceEyebrow: string;
  surfaceTitle: string;
  updateSuccessLabel: string;
  visibleLabel: (count: number) => string;
};

export type TextLibraryDefinition = {
  cardClass: string;
  contentFieldName: string;
  contentRows: {
    create: number;
    edit: number;
  };
  gridClass: string;
  create: (api: unknown, profileId: string, draft: TextLibraryDraft) => Promise<TextLibraryItem>;
  defaultDraft: () => TextLibraryDraft;
  draftFromItem: (item: TextLibraryItem) => TextLibraryDraft;
  entity: TextLibraryEntity;
  get: (api: unknown, profileId: string, itemId: string) => Promise<TextLibraryItem>;
  idFieldName: string;
  idReadonlyOnEdit: boolean;
  list: (api: unknown, profileId: string, query: string) => Promise<TextLibraryItem[]>;
  remove: (api: unknown, profileId: string, item: TextLibraryItem) => Promise<void>;
  ui: TextLibraryUiDefinition;
  update: (api: unknown, profileId: string, item: TextLibraryItem, draft: TextLibraryDraft) => Promise<TextLibraryItem>;
  validateCreate: (draft: TextLibraryDraft) => string;
  validateUpdate: (draft: TextLibraryDraft, item: TextLibraryItem) => string;
};
