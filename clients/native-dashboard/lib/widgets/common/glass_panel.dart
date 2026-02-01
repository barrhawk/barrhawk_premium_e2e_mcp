import 'dart:ui';
import 'package:flutter/material.dart';

import '../../theme/theme.dart';

class GlassPanel extends StatelessWidget {
  final Widget child;
  final Color? borderColor;
  final EdgeInsetsGeometry? padding;
  final double? width;
  final double? height;

  const GlassPanel({
    super.key,
    required this.child,
    this.borderColor,
    this.padding,
    this.width,
    this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: BarrHawkColors.bgPanel.withOpacity(0.7),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: borderColor ?? BarrHawkColors.border.withOpacity(0.5),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Colors.white.withOpacity(0.05),
                  Colors.white.withOpacity(0.02),
                ],
              ),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

class PanelHeader extends StatelessWidget {
  final String title;
  final Color iconColor;
  final Widget? trailing;

  const PanelHeader({
    super.key,
    required this.title,
    required this.iconColor,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: BarrHawkColors.border),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: iconColor,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Center(
              child: Text(
                title[0],
                style: const TextStyle(
                  fontFamily: 'sans-serif',
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            title.toUpperCase(),
            style: TextStyle(
              fontFamily: 'sans-serif',
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 1,
              color: BarrHawkColors.textSecondary,
            ),
          ),
          const Spacer(),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class StatusBadge extends StatelessWidget {
  final String status;

  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status.toLowerCase()) {
      case 'running':
      case 'ready':
      case 'connected':
      case 'ok':
        color = BarrHawkColors.ok;
        break;
      case 'busy':
      case 'warning':
        color = BarrHawkColors.warning;
        break;
      case 'error':
      case 'crashed':
      case 'disconnected':
        color = BarrHawkColors.error;
        break;
      default:
        color = BarrHawkColors.idle;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
          color: color,
        ),
      ),
    );
  }
}
