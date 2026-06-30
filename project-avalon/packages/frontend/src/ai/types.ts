import type { ActionableTree } from '@avalon/shared';

export type FieldAction =
  | 'Click'
  | 'Typing'
  | 'SelectOption'
  | 'FileUpload'
  | 'Check'
  | 'Uncheck';

export interface FlatFormField {
  id: string;
  groupIndex: number;
  childIndex: number;
  groupContext: string;
  label: string;
  required: boolean;
  controlType: string;
  controlTag: string;
  options?: string[];
  optionsSource?: string;
  skippable?: boolean;
}

export interface FieldActionPlan {
  id: string;
  action: FieldAction;
  shouldSkip: 'Yes' | 'No';
  /** Use "N/A" for Click and when ShouldSkip is Yes */
  value: string;
  notes?: string;
}

export interface FormAnalysisResult {
  fields: FieldActionPlan[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: { totalUsd: number; currency: string };
  };
}

export interface AnalyzeFormOptions {
  tree: ActionableTree;
  applicantContext?: string;
}
