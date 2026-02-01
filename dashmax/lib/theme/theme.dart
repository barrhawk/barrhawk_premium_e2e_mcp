import 'package:flutter/material.dart';

class BarrHawkColors {
  // Backgrounds
  static const bg = Color(0xFF0A0E17);
  static const bgPanel = Color(0xFF0F172A);
  static const bgCard = Color(0xFF1E293B);
  static const bgHover = Color(0xFF334155);
  static const bgElevated = Color(0xFF1E293B);

  // Accents
  static const bridge = Color(0xFF3B82F6);
  static const doctor = Color(0xFF8B5CF6);
  static const igor = Color(0xFF10B981);
  static const stream = Color(0xFF6366F1);

  // Status
  static const ok = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);
  static const error = Color(0xFFEF4444);
  static const idle = Color(0xFF64748B);

  // Text
  static const textPrimary = Color(0xFFF1F5F9);
  static const textSecondary = Color(0xFF94A3B8);
  static const textMuted = Color(0xFF64748B);

  // Border
  static const border = Color(0xFF334155);

  // Gradients
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF3B82F6), Color(0xFF8B5CF6)],
  );

  static const bridgeGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF3B82F6), Color(0xFF2563EB)],
  );

  static const doctorGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF8B5CF6), Color(0xFF7C3AED)],
  );

  static const igorGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF10B981), Color(0xFF059669)],
  );
}

class BarrHawkTheme {
  static ThemeData get dark {
    // Use monospace for code-like appearance
    const monoFont = 'monospace';
    const sansFont = 'sans-serif';

    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: BarrHawkColors.bg,
      primaryColor: BarrHawkColors.bridge,
      colorScheme: const ColorScheme.dark(
        primary: BarrHawkColors.bridge,
        secondary: BarrHawkColors.doctor,
        surface: BarrHawkColors.bgPanel,
        error: BarrHawkColors.error,
      ),
      fontFamily: monoFont,
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          fontFamily: 'sans-serif',
          fontSize: 32,
          fontWeight: FontWeight.w700,
          color: BarrHawkColors.textPrimary,
          letterSpacing: -0.5,
        ),
        displayMedium: TextStyle(
          fontFamily: 'sans-serif',
          fontSize: 24,
          fontWeight: FontWeight.w700,
          color: BarrHawkColors.textPrimary,
          letterSpacing: -0.5,
        ),
        headlineMedium: TextStyle(
          fontFamily: 'sans-serif',
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: BarrHawkColors.textPrimary,
        ),
        titleLarge: TextStyle(
          fontFamily: 'sans-serif',
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: BarrHawkColors.textSecondary,
          letterSpacing: 1.0,
        ),
        titleMedium: TextStyle(
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: BarrHawkColors.textPrimary,
        ),
        bodyLarge: TextStyle(
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: BarrHawkColors.textPrimary,
        ),
        bodyMedium: TextStyle(
          fontFamily: 'monospace',
          fontSize: 13,
          fontWeight: FontWeight.w400,
          color: BarrHawkColors.textSecondary,
        ),
        bodySmall: TextStyle(
          fontFamily: 'monospace',
          fontSize: 11,
          fontWeight: FontWeight.w400,
          color: BarrHawkColors.textMuted,
        ),
        labelLarge: TextStyle(
          fontFamily: 'sans-serif',
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: BarrHawkColors.textPrimary,
        ),
        labelMedium: TextStyle(
          fontFamily: 'monospace',
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: BarrHawkColors.textSecondary,
        ),
        labelSmall: TextStyle(
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: BarrHawkColors.textMuted,
          letterSpacing: 0.5,
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: BarrHawkColors.border,
        thickness: 1,
      ),
      cardTheme: const CardThemeData(
        color: BarrHawkColors.bgPanel,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(12)),
          side: BorderSide(color: BarrHawkColors.border),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BarrHawkColors.bridge,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BarrHawkColors.textPrimary,
          side: const BorderSide(color: BarrHawkColors.border),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          textStyle: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BarrHawkColors.bgCard,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: BarrHawkColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: BarrHawkColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: BarrHawkColors.bridge),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        hintStyle: const TextStyle(
          color: BarrHawkColors.textMuted,
          fontSize: 13,
        ),
      ),
      scrollbarTheme: ScrollbarThemeData(
        thumbColor: WidgetStateProperty.all(BarrHawkColors.bgHover),
        trackColor: WidgetStateProperty.all(BarrHawkColors.bgPanel),
        radius: const Radius.circular(4),
        thickness: WidgetStateProperty.all(6),
      ),
    );
  }
}

// Extensions for easy access
extension ContextThemeExtension on BuildContext {
  ThemeData get theme => Theme.of(this);
  TextTheme get textTheme => Theme.of(this).textTheme;
}
