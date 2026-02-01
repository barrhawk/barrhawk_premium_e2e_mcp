import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../state/models.dart';
import '../../theme/theme.dart';

class CommandPalette extends StatefulWidget {
  const CommandPalette({super.key});

  @override
  State<CommandPalette> createState() => _CommandPaletteState();
}

class _CommandPaletteState extends State<CommandPalette> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  int _selectedIndex = 0;
  List<Command> _filteredCommands = [];

  @override
  void initState() {
    super.initState();
    _focusNode.requestFocus();
    _updateFilteredCommands('');
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  List<Command> _getCommands(AppState state) {
    final commands = <Command>[
      Command(
        id: 'restart-doctor',
        title: 'Restart Doctor',
        icon: '🔄',
        hotkey: '⌘⇧R',
        category: 'bridge',
        handler: () => _confirm('Restart Doctor?', state.restartDoctor),
      ),
      Command(
        id: 'pause',
        title: state.paused ? 'Resume Traffic' : 'Pause Traffic',
        icon: state.paused ? '▶' : '⏸',
        hotkey: 'P',
        category: 'bridge',
        handler: () => state.paused ? state.resumeTraffic() : state.pauseTraffic(),
      ),
      Command(
        id: 'spawn-igor',
        title: 'Spawn New Igor',
        icon: '➕',
        hotkey: '⌘N',
        category: 'igor',
        handler: () => state.spawnIgor(),
      ),
      Command(
        id: 'clear-stream',
        title: 'Clear Stream',
        icon: '🗑',
        hotkey: '⌘L',
        category: 'stream',
        handler: () => state.clearStream(),
      ),
      Command(
        id: 'toggle-autoscroll',
        title: 'Toggle Auto-scroll',
        icon: '⏬',
        category: 'stream',
        handler: () => state.toggleAutoScroll(),
      ),
      Command(
        id: 'shutdown',
        title: 'Shutdown Bridge',
        icon: '⏹',
        hotkey: '⌘⇧Q',
        category: 'bridge',
        handler: () => _confirm('Shutdown Bridge?', state.shutdownBridge),
      ),
    ];

    // Add kill commands for each Igor
    for (final igor in state.igors.values) {
      commands.add(Command(
        id: 'kill-${igor.id}',
        title: 'Kill ${igor.id}',
        icon: '💀',
        category: 'igor',
        handler: () => _confirm('Kill ${igor.id}?', () => state.killIgor(igor.id)),
      ));
    }

    // Add cancel commands for each swarm
    for (final swarm in state.doctor.swarms) {
      commands.add(Command(
        id: 'cancel-swarm-${swarm.id}',
        title: 'Cancel Swarm: ${swarm.name}',
        icon: '⏹',
        category: 'swarm',
        handler: () => _confirm('Cancel ${swarm.name}?', () => state.cancelSwarm(swarm.id)),
      ));
    }

    return commands;
  }

  void _updateFilteredCommands(String query) {
    final state = context.read<AppState>();
    final commands = _getCommands(state);

    if (query.isEmpty) {
      _filteredCommands = commands;
    } else {
      final q = query.toLowerCase();
      _filteredCommands = commands
          .where((c) => c.title.toLowerCase().contains(q))
          .toList();
    }

    _selectedIndex = 0;
    setState(() {});
  }

  void _confirm(String message, VoidCallback action) {
    context.read<AppState>().closeCommandPalette();
    showDialog(
      context: context,
      builder: (context) => _ConfirmDialog(
        message: message,
        onConfirm: action,
      ),
    );
  }

  void _executeSelected() {
    if (_filteredCommands.isEmpty) return;
    final command = _filteredCommands[_selectedIndex];
    context.read<AppState>().closeCommandPalette();
    command.handler();
  }

  void _moveSelection(int delta) {
    setState(() {
      _selectedIndex = (_selectedIndex + delta).clamp(0, _filteredCommands.length - 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Backdrop
        GestureDetector(
          onTap: () => context.read<AppState>().closeCommandPalette(),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
            child: Container(
              color: Colors.black.withOpacity(0.5),
            ),
          ),
        ),

        // Modal
        Center(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 200),
            child: Material(
              color: Colors.transparent,
              child: Container(
                width: 500,
                constraints: const BoxConstraints(maxHeight: 400),
                decoration: BoxDecoration(
                  color: BarrHawkColors.bgPanel,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: BarrHawkColors.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.4),
                      blurRadius: 30,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Search input
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: const BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: BarrHawkColors.border),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Text('🔍', style: TextStyle(fontSize: 18)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: KeyboardListener(
                              focusNode: FocusNode(),
                              onKeyEvent: (event) {
                                if (event is! KeyDownEvent) return;
                                if (event.logicalKey == LogicalKeyboardKey.arrowDown) {
                                  _moveSelection(1);
                                } else if (event.logicalKey == LogicalKeyboardKey.arrowUp) {
                                  _moveSelection(-1);
                                } else if (event.logicalKey == LogicalKeyboardKey.enter) {
                                  _executeSelected();
                                } else if (event.logicalKey == LogicalKeyboardKey.escape) {
                                  context.read<AppState>().closeCommandPalette();
                                }
                              },
                              child: TextField(
                                controller: _controller,
                                focusNode: _focusNode,
                                decoration: const InputDecoration(
                                  hintText: 'Type a command...',
                                  border: InputBorder.none,
                                  contentPadding: EdgeInsets.zero,
                                  isDense: true,
                                ),
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: BarrHawkColors.textPrimary,
                                ),
                                onChanged: _updateFilteredCommands,
                                onSubmitted: (_) => _executeSelected(),
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                            decoration: BoxDecoration(
                              color: BarrHawkColors.bgCard,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'ESC',
                              style: TextStyle(
                                fontSize: 10,
                                color: BarrHawkColors.textMuted,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Commands list
                    Flexible(
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: _filteredCommands.length,
                        itemBuilder: (context, index) {
                          final command = _filteredCommands[index];
                          final isSelected = index == _selectedIndex;

                          return MouseRegion(
                            onEnter: (_) => setState(() => _selectedIndex = index),
                            child: GestureDetector(
                              onTap: () {
                                _selectedIndex = index;
                                _executeSelected();
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? BarrHawkColors.bgCard
                                      : Colors.transparent,
                                  border: isSelected
                                      ? const Border(
                                          left: BorderSide(
                                            color: BarrHawkColors.bridge,
                                            width: 2,
                                          ),
                                        )
                                      : null,
                                ),
                                child: Row(
                                  children: [
                                    SizedBox(
                                      width: 24,
                                      child: Text(
                                        command.icon,
                                        style: const TextStyle(fontSize: 16),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        command.title,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          color: BarrHawkColors.textPrimary,
                                        ),
                                      ),
                                    ),
                                    if (command.hotkey != null)
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                          vertical: 3,
                                        ),
                                        decoration: BoxDecoration(
                                          color: BarrHawkColors.bgCard,
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: Text(
                                          command.hotkey!,
                                          style: const TextStyle(
                                            fontSize: 10,
                                            color: BarrHawkColors.textMuted,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ConfirmDialog extends StatelessWidget {
  final String message;
  final VoidCallback onConfirm;

  const _ConfirmDialog({
    required this.message,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: BarrHawkColors.bgPanel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: BarrHawkColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Confirm Action',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: const TextStyle(color: BarrHawkColors.textSecondary),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 12),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: BarrHawkColors.error,
                  ),
                  onPressed: () {
                    Navigator.of(context).pop();
                    onConfirm();
                  },
                  child: const Text('Confirm'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
