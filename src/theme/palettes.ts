import { ThemeMode, ThemePalette } from '../domain/models';

export interface PaletteColorTokens {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  tertiary: string;
  background: string;
  surface: string;
  surfaceVariant: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  onBackground: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  incomeGreen: string;
  expenseRed: string;
  warningAmber: string;
  transferBlue: string;
  heroGradientStart: string;
  heroGradientEnd: string;
}

export interface PaletteMetadata {
  palette: ThemePalette;
  displayName: string;
  tagline: string;
  swatches: [string, string, string];
  light: PaletteColorTokens;
  dark: PaletteColorTokens;
}

export const PALETTE_DEFINITIONS: Record<ThemePalette, PaletteMetadata> = {
  [ThemePalette.DEFAULT]: {
    palette: ThemePalette.DEFAULT,
    displayName: 'Emerald',
    tagline: 'Crisp mint & slate — default financial clarity',
    swatches: ['#059669', '#0D9488', '#2563EB'],
    light: {
      primary: '#059669',
      onPrimary: '#FFFFFF',
      primaryContainer: '#D1FAE5',
      onPrimaryContainer: '#064E3B',
      secondary: '#0D9488',
      secondaryContainer: '#CCFBF1',
      tertiary: '#2563EB',
      background: '#F4F6FA',
      surface: '#FFFFFF',
      surfaceVariant: '#EEF2F6',
      surfaceContainer: '#F8FAFC',
      surfaceContainerHigh: '#E2E8F0',
      onBackground: '#0F172A',
      onSurface: '#0F172A',
      onSurfaceVariant: '#475569',
      outline: '#CBD5E1',
      outlineVariant: '#E2E8F0',
      incomeGreen: '#10B981',
      expenseRed: '#EF4444',
      warningAmber: '#F59E0B',
      transferBlue: '#3B82F6',
      heroGradientStart: '#065F46',
      heroGradientEnd: '#0D9488'
    },
    dark: {
      primary: '#34D399',
      onPrimary: '#022C22',
      primaryContainer: '#064E3B',
      onPrimaryContainer: '#A7F3D0',
      secondary: '#2DD4BF',
      secondaryContainer: '#134E4A',
      tertiary: '#60A5FA',
      background: '#0B1120',
      surface: '#111827',
      surfaceVariant: '#1E293B',
      surfaceContainer: '#162032',
      surfaceContainerHigh: '#263449',
      onBackground: '#F8FAFC',
      onSurface: '#F8FAFC',
      onSurfaceVariant: '#94A3B8',
      outline: '#334155',
      outlineVariant: '#1E293B',
      incomeGreen: '#34D399',
      expenseRed: '#F87171',
      warningAmber: '#FBBF24',
      transferBlue: '#60A5FA',
      heroGradientStart: '#064E3B',
      heroGradientEnd: '#0F766E'
    }
  },
  [ThemePalette.DEEP_OCEAN]: {
    palette: ThemePalette.DEEP_OCEAN,
    displayName: 'Deep Ocean',
    tagline: 'Sapphire blues & teal — calm, private-bank poise',
    swatches: ['#0284C7', '#0891B2', '#4F46E5'],
    light: {
      primary: '#0284C7',
      onPrimary: '#FFFFFF',
      primaryContainer: '#E0F2FE',
      onPrimaryContainer: '#0C4A6E',
      secondary: '#0891B2',
      secondaryContainer: '#CFFAFE',
      tertiary: '#4F46E5',
      background: '#F0F6FC',
      surface: '#FFFFFF',
      surfaceVariant: '#E2EDF8',
      surfaceContainer: '#F5F9FF',
      surfaceContainerHigh: '#D8E6F3',
      onBackground: '#0C1928',
      onSurface: '#0C1928',
      onSurfaceVariant: '#475E75',
      outline: '#C2D4E8',
      outlineVariant: '#DCE8F5',
      incomeGreen: '#059669',
      expenseRed: '#E11D48',
      warningAmber: '#D97706',
      transferBlue: '#0284C7',
      heroGradientStart: '#075985',
      heroGradientEnd: '#1D4ED8'
    },
    dark: {
      primary: '#38BDF8',
      onPrimary: '#082F49',
      primaryContainer: '#075985',
      onPrimaryContainer: '#BAE6FD',
      secondary: '#22D3EE',
      secondaryContainer: '#164E63',
      tertiary: '#818CF8',
      background: '#07101E',
      surface: '#0F1B2D',
      surfaceVariant: '#192B44',
      surfaceContainer: '#132238',
      surfaceContainerHigh: '#213654',
      onBackground: '#F0F9FF',
      onSurface: '#F0F9FF',
      onSurfaceVariant: '#93B4D4',
      outline: '#2A4365',
      outlineVariant: '#192B44',
      incomeGreen: '#34D399',
      expenseRed: '#FB7185',
      warningAmber: '#FBBF24',
      transferBlue: '#38BDF8',
      heroGradientStart: '#0C4A6E',
      heroGradientEnd: '#1E3A8A'
    }
  },
  [ThemePalette.FOREST_GLOW]: {
    palette: ThemePalette.FOREST_GLOW,
    displayName: 'Forest Glow',
    tagline: 'Deep moss & warm gold — grounded wealth builder',
    swatches: ['#15803D', '#65A30D', '#CA8A04'],
    light: {
      primary: '#15803D',
      onPrimary: '#FFFFFF',
      primaryContainer: '#DCFCE7',
      onPrimaryContainer: '#14532D',
      secondary: '#65A30D',
      secondaryContainer: '#ECFCCB',
      tertiary: '#CA8A04',
      background: '#F4F7F4',
      surface: '#FFFFFF',
      surfaceVariant: '#E6EFE6',
      surfaceContainer: '#F7FAF7',
      surfaceContainerHigh: '#DAE6DA',
      onBackground: '#111C14',
      onSurface: '#111C14',
      onSurfaceVariant: '#465B4B',
      outline: '#C3D4C6',
      outlineVariant: '#DFECE1',
      incomeGreen: '#16A34A',
      expenseRed: '#DC2626',
      warningAmber: '#D97706',
      transferBlue: '#2563EB',
      heroGradientStart: '#14532D',
      heroGradientEnd: '#15803D'
    },
    dark: {
      primary: '#4ADE80',
      onPrimary: '#052E16',
      primaryContainer: '#14532D',
      onPrimaryContainer: '#BBF7D0',
      secondary: '#A3E635',
      secondaryContainer: '#365314',
      tertiary: '#FACC15',
      background: '#0A130D',
      surface: '#111E15',
      surfaceVariant: '#1B2F21',
      surfaceContainer: '#15251A',
      surfaceContainerHigh: '#233B2A',
      onBackground: '#F0FDF4',
      onSurface: '#F0FDF4',
      onSurfaceVariant: '#94B89D',
      outline: '#2D4A35',
      outlineVariant: '#1B2F21',
      incomeGreen: '#4ADE80',
      expenseRed: '#F87171',
      warningAmber: '#FACC15',
      transferBlue: '#60A5FA',
      heroGradientStart: '#14532D',
      heroGradientEnd: '#365314'
    }
  },
  [ThemePalette.MIDNIGHT_VIOLET]: {
    palette: ThemePalette.MIDNIGHT_VIOLET,
    displayName: 'Midnight Violet',
    tagline: 'Royal iris & magenta — bold modern fintech',
    swatches: ['#7C3AED', '#9333EA', '#EC4899'],
    light: {
      primary: '#7C3AED',
      onPrimary: '#FFFFFF',
      primaryContainer: '#EDE9FE',
      onPrimaryContainer: '#4C1D95',
      secondary: '#9333EA',
      secondaryContainer: '#F3E8FF',
      tertiary: '#EC4899',
      background: '#F6F4FB',
      surface: '#FFFFFF',
      surfaceVariant: '#ECE8F6',
      surfaceContainer: '#F9F7FD',
      surfaceContainerHigh: '#E2DCF2',
      onBackground: '#171126',
      onSurface: '#171126',
      onSurfaceVariant: '#564B73',
      outline: '#CEC5E6',
      outlineVariant: '#E6E0F5',
      incomeGreen: '#10B981',
      expenseRed: '#F43F5E',
      warningAmber: '#F59E0B',
      transferBlue: '#6366F1',
      heroGradientStart: '#4C1D95',
      heroGradientEnd: '#7C3AED'
    },
    dark: {
      primary: '#A78BFA',
      onPrimary: '#2E1065',
      primaryContainer: '#4C1D95',
      onPrimaryContainer: '#DDD6FE',
      secondary: '#C084FC',
      secondaryContainer: '#581C87',
      tertiary: '#F472B6',
      background: '#0E0A1A',
      surface: '#17112B',
      surfaceVariant: '#251C42',
      surfaceContainer: '#1D1535',
      surfaceContainerHigh: '#302454',
      onBackground: '#F5F3FF',
      onSurface: '#F5F3FF',
      onSurfaceVariant: '#A89CC8',
      outline: '#3D2F6A',
      outlineVariant: '#251C42',
      incomeGreen: '#34D399',
      expenseRed: '#FB7185',
      warningAmber: '#FBBF24',
      transferBlue: '#818CF8',
      heroGradientStart: '#3B0764',
      heroGradientEnd: '#5B21B6'
    }
  },
  [ThemePalette.EMBER]: {
    palette: ThemePalette.EMBER,
    displayName: 'Ember',
    tagline: 'Terracotta & amber — warm editorial ledger',
    swatches: ['#EA580C', '#D97706', '#E11D48'],
    light: {
      primary: '#EA580C',
      onPrimary: '#FFFFFF',
      primaryContainer: '#FFEDD5',
      onPrimaryContainer: '#7C2D12',
      secondary: '#D97706',
      secondaryContainer: '#FEF3C7',
      tertiary: '#E11D48',
      background: '#FAF6F3',
      surface: '#FFFFFF',
      surfaceVariant: '#F3EAE2',
      surfaceContainer: '#FCF9F6',
      surfaceContainerHigh: '#E8DDD2',
      onBackground: '#21150E',
      onSurface: '#21150E',
      onSurfaceVariant: '#695346',
      outline: '#DBCABB',
      outlineVariant: '#EFE4DA',
      incomeGreen: '#16A34A',
      expenseRed: '#DC2626',
      warningAmber: '#D97706',
      transferBlue: '#2563EB',
      heroGradientStart: '#9A3412',
      heroGradientEnd: '#D97706'
    },
    dark: {
      primary: '#FB923C',
      onPrimary: '#431407',
      primaryContainer: '#7C2D12',
      onPrimaryContainer: '#FED7AA',
      secondary: '#FBBF24',
      secondaryContainer: '#78350F',
      tertiary: '#FB7185',
      background: '#160E09',
      surface: '#22160F',
      surfaceVariant: '#332218',
      surfaceContainer: '#291B13',
      surfaceContainerHigh: '#402B1F',
      onBackground: '#FFF7ED',
      onSurface: '#FFF7ED',
      onSurfaceVariant: '#C4A693',
      outline: '#523829',
      outlineVariant: '#332218',
      incomeGreen: '#4ADE80',
      expenseRed: '#F87171',
      warningAmber: '#FBBF24',
      transferBlue: '#60A5FA',
      heroGradientStart: '#7C2D12',
      heroGradientEnd: '#92400E'
    }
  },
  [ThemePalette.ARCTIC]: {
    palette: ThemePalette.ARCTIC,
    displayName: 'Arctic',
    tagline: 'Glacier cyan & steel — ultra-clean Nordic minimal',
    swatches: ['#0891B2', '#3B82F6', '#64748B'],
    light: {
      primary: '#0891B2',
      onPrimary: '#FFFFFF',
      primaryContainer: '#CFFAFE',
      onPrimaryContainer: '#164E63',
      secondary: '#3B82F6',
      secondaryContainer: '#DBEAFE',
      tertiary: '#64748B',
      background: '#F3F7F9',
      surface: '#FFFFFF',
      surfaceVariant: '#E6EFF4',
      surfaceContainer: '#F7FAFC',
      surfaceContainerHigh: '#DAE6ED',
      onBackground: '#0F1E26',
      onSurface: '#0F1E26',
      onSurfaceVariant: '#4B6370',
      outline: '#C5D6E0',
      outlineVariant: '#E1ECF2',
      incomeGreen: '#0D9488',
      expenseRed: '#E11D48',
      warningAmber: '#F59E0B',
      transferBlue: '#0284C7',
      heroGradientStart: '#155E75',
      heroGradientEnd: '#0284C7'
    },
    dark: {
      primary: '#22D3EE',
      onPrimary: '#083344',
      primaryContainer: '#155E75',
      onPrimaryContainer: '#A5F3FC',
      secondary: '#60A5FA',
      secondaryContainer: '#1E3A8A',
      tertiary: '#94A3B8',
      background: '#091318',
      surface: '#101E26',
      surfaceVariant: '#1A2F3B',
      surfaceContainer: '#14252F',
      surfaceContainerHigh: '#223C4B',
      onBackground: '#ECFEFF',
      onSurface: '#ECFEFF',
      onSurfaceVariant: '#93B2C2',
      outline: '#2B4A5C',
      outlineVariant: '#1A2F3B',
      incomeGreen: '#2DD4BF',
      expenseRed: '#FB7185',
      warningAmber: '#FBBF24',
      transferBlue: '#38BDF8',
      heroGradientStart: '#164E63',
      heroGradientEnd: '#0369A1'
    }
  }
};

export function resolveEffectiveTheme(
  palette: ThemePalette,
  mode: ThemeMode,
  prefersDark: boolean
): { isDark: boolean; tokens: PaletteColorTokens; meta: PaletteMetadata } {
  const meta = PALETTE_DEFINITIONS[palette] ?? PALETTE_DEFINITIONS[ThemePalette.DEFAULT];
  const isDark =
    mode === ThemeMode.DARK || (mode === ThemeMode.SYSTEM && prefersDark);
  return {
    isDark,
    tokens: isDark ? meta.dark : meta.light,
    meta
  };
}

export function applyThemeCssVariables(tokens: PaletteColorTokens, isDark: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  root.style.setProperty('--primary', tokens.primary);
  root.style.setProperty('--on-primary', tokens.onPrimary);
  root.style.setProperty('--primary-container', tokens.primaryContainer);
  root.style.setProperty('--on-primary-container', tokens.onPrimaryContainer);
  root.style.setProperty('--secondary', tokens.secondary);
  root.style.setProperty('--secondary-container', tokens.secondaryContainer);
  root.style.setProperty('--tertiary', tokens.tertiary);
  root.style.setProperty('--bg', tokens.background);
  root.style.setProperty('--surface', tokens.surface);
  root.style.setProperty('--surface-variant', tokens.surfaceVariant);
  root.style.setProperty('--surface-container', tokens.surfaceContainer);
  root.style.setProperty('--surface-container-high', tokens.surfaceContainerHigh);
  root.style.setProperty('--on-bg', tokens.onBackground);
  root.style.setProperty('--on-surface', tokens.onSurface);
  root.style.setProperty('--on-surface-variant', tokens.onSurfaceVariant);
  root.style.setProperty('--outline', tokens.outline);
  root.style.setProperty('--outline-variant', tokens.outlineVariant);
  root.style.setProperty('--income', tokens.incomeGreen);
  root.style.setProperty('--expense', tokens.expenseRed);
  root.style.setProperty('--warning', tokens.warningAmber);
  root.style.setProperty('--transfer', tokens.transferBlue);
  root.style.setProperty('--hero-start', tokens.heroGradientStart);
  root.style.setProperty('--hero-end', tokens.heroGradientEnd);
}

export const ACCOUNT_PRESET_COLORS = [
  '#2563EB',
  '#059669',
  '#0D9488',
  '#7C3AED',
  '#EA580C',
  '#E11D48',
  '#0284C7',
  '#CA8A04',
  '#4F46E5',
  '#EC4899'
];
