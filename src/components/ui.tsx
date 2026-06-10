import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

export const Card: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({
  children,
  style,
}) => <View style={[s.card, style]}>{children}</View>;

export const Chip: React.FC<{
  label: string;
  active?: boolean;
  color?: string;
  onPress?: () => void;
  onLongPress?: () => void;
}> = ({ label, active, color = colors.primary, onPress, onLongPress }) => (
  <TouchableOpacity
    onPress={onPress}
    onLongPress={onLongPress}
    style={[
      s.chip,
      { borderColor: color },
      active && { backgroundColor: color },
    ]}
  >
    <Text style={[s.chipText, { color: active ? '#fff' : color }]}>{label}</Text>
  </TouchableOpacity>
);

export const Dot: React.FC<{ color: string; size?: number }> = ({ color, size = 6 }) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
      margin: 1,
    }}
  />
);

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={s.sectionTitle}>{children}</Text>
);

export const Button: React.FC<{
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
}> = ({ label, onPress, variant = 'primary', disabled }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={[
      s.btn,
      variant === 'outline' && s.btnOutline,
      variant === 'danger' && { backgroundColor: colors.danger },
      disabled && { opacity: 0.4 },
    ]}
  >
    <Text style={[s.btnText, variant === 'outline' && { color: colors.primary }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    marginRight: spacing.sm,
    marginBottom: spacing.xs,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
