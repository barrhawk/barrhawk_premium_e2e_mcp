import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../state/models.dart';
import '../../theme/theme.dart';
import '../common/glass_panel.dart';

class StreamPanel extends StatefulWidget {
  const StreamPanel({super.key});

  @override
  State<StreamPanel> createState() => _StreamPanelState();
}

class _StreamPanelState extends State<StreamPanel> {
  final ScrollController _scrollController = ScrollController();
  String _filter = 'all';

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, state, _) {
        final events = _filterEvents(state.stream);

        // Auto-scroll when new events arrive
        if (state.autoScroll && events.isNotEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_scrollController.hasClients) {
              _scrollController.animateTo(
                _scrollController.position.maxScrollExtent,
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
              );
            }
          });
        }

        return GlassPanel(
          borderColor: BarrHawkColors.stream.withOpacity(0.3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
                        color: BarrHawkColors.stream,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Center(
                        child: Text(
                          'F',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      'FRANKENSTREAM',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1,
                        color: BarrHawkColors.textSecondary,
                      ),
                    ),
                    const Spacer(),

                    // Filter chips
                    _FilterChip(
                      label: 'All',
                      selected: _filter == 'all',
                      onTap: () => setState(() => _filter = 'all'),
                    ),
                    const SizedBox(width: 4),
                    _FilterChip(
                      label: 'MCP',
                      selected: _filter == 'mcp',
                      onTap: () => setState(() => _filter = 'mcp'),
                    ),
                    const SizedBox(width: 4),
                    _FilterChip(
                      label: 'Errors',
                      selected: _filter == 'error',
                      color: BarrHawkColors.error,
                      onTap: () => setState(() => _filter = 'error'),
                    ),

                    const SizedBox(width: 16),

                    // Auto-scroll toggle
                    InkWell(
                      onTap: () => state.toggleAutoScroll(),
                      borderRadius: BorderRadius.circular(4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: state.autoScroll
                              ? BarrHawkColors.stream.withOpacity(0.2)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(
                            color: state.autoScroll
                                ? BarrHawkColors.stream
                                : BarrHawkColors.border,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.keyboard_double_arrow_down,
                              size: 14,
                              color: state.autoScroll
                                  ? BarrHawkColors.stream
                                  : BarrHawkColors.textMuted,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'Auto',
                              style: TextStyle(
                                fontSize: 10,
                                color: state.autoScroll
                                    ? BarrHawkColors.stream
                                    : BarrHawkColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(width: 8),

                    // Clear button
                    InkWell(
                      onTap: () => state.clearStream(),
                      borderRadius: BorderRadius.circular(4),
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        child: const Icon(
                          Icons.delete_outline,
                          size: 16,
                          color: BarrHawkColors.textMuted,
                        ),
                      ),
                    ),

                    const SizedBox(width: 8),

                    // Event count
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: BarrHawkColors.bgCard,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '${events.length} events',
                        style: const TextStyle(
                          fontSize: 10,
                          color: BarrHawkColors.textMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Events list
              Expanded(
                child: events.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.stream,
                              size: 32,
                              color: BarrHawkColors.textMuted,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'No events yet',
                              style: TextStyle(
                                color: BarrHawkColors.textMuted,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(8),
                        itemCount: events.length,
                        itemBuilder: (context, index) {
                          return _EventRow(event: events[index]);
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  List<StreamEvent> _filterEvents(List<StreamEvent> events) {
    if (_filter == 'all') return events;
    if (_filter == 'error') {
      return events.where((e) => e.level == 'error').toList();
    }
    return events.where((e) => e.type.toLowerCase().contains(_filter)).toList();
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color? color;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final chipColor = color ?? BarrHawkColors.stream;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? chipColor.withOpacity(0.2) : Colors.transparent,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(
            color: selected ? chipColor : Colors.transparent,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: selected ? chipColor : BarrHawkColors.textMuted,
          ),
        ),
      ),
    );
  }
}

class _EventRow extends StatelessWidget {
  final StreamEvent event;

  const _EventRow({required this.event});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: event.level == 'error'
            ? BarrHawkColors.error.withOpacity(0.05)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Timestamp
          SizedBox(
            width: 70,
            child: Text(
              _formatTime(event.timestamp),
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 10,
                color: BarrHawkColors.textMuted,
              ),
            ),
          ),

          // Type badge
          Container(
            width: 60,
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            decoration: BoxDecoration(
              color: _getTypeColor(event.type).withOpacity(0.15),
              borderRadius: BorderRadius.circular(3),
            ),
            child: Text(
              event.type.toUpperCase(),
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: _getTypeColor(event.type),
              ),
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
            ),
          ),

          const SizedBox(width: 8),

          // Source
          SizedBox(
            width: 80,
            child: Text(
              event.source,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: BarrHawkColors.textSecondary,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),

          const SizedBox(width: 8),

          // Message
          Expanded(
            child: Text(
              event.message,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 11,
                color: event.level == 'error'
                    ? BarrHawkColors.error
                    : BarrHawkColors.textPrimary,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),

          // Duration (if present)
          if (event.duration != null)
            Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: BarrHawkColors.bgCard,
                borderRadius: BorderRadius.circular(3),
              ),
              child: Text(
                '${event.duration}ms',
                style: const TextStyle(
                  fontSize: 9,
                  color: BarrHawkColors.textMuted,
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    return '${time.hour.toString().padLeft(2, '0')}:'
        '${time.minute.toString().padLeft(2, '0')}:'
        '${time.second.toString().padLeft(2, '0')}';
  }

  Color _getTypeColor(String type) {
    switch (type.toLowerCase()) {
      case 'mcp':
        return BarrHawkColors.igor;
      case 'http':
        return BarrHawkColors.doctor;
      case 'ws':
        return BarrHawkColors.bridge;
      case 'system':
        return BarrHawkColors.warning;
      case 'error':
        return BarrHawkColors.error;
      default:
        return BarrHawkColors.idle;
    }
  }
}
