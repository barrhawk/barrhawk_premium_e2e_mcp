import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'models.dart';

class AppState extends ChangeNotifier {
  // Connection
  bool connected = false;
  String bridgeUrl = 'ws://localhost:3334';
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  int _reconnectAttempts = 0;
  static const _maxReconnectAttempts = 10;

  // State
  BridgeState bridge = BridgeState();
  DoctorState doctor = DoctorState();
  Map<String, IgorState> igors = {};
  List<StreamEvent> stream = [];

  // UI State
  bool paused = false;
  bool autoScroll = true;
  StreamFilter streamFilter = StreamFilter();
  bool commandPaletteOpen = false;

  // Settings
  bool soundEnabled = false;
  bool animationsEnabled = true;

  // Connect to Bridge
  void connect() {
    _connectWebSocket();
  }

  void _connectWebSocket() {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(bridgeUrl));

      _subscription = _channel!.stream.listen(
        (data) {
          connected = true;
          _reconnectAttempts = 0;
          _handleMessage(data);
          notifyListeners();
        },
        onError: (error) {
          debugPrint('WebSocket error: $error');
          _handleDisconnect();
        },
        onDone: () {
          _handleDisconnect();
        },
      );

      // Subscribe to all events
      sendCommand('subscribe', {'channels': ['all']});

      notifyListeners();
    } catch (e) {
      debugPrint('Failed to connect: $e');
      _handleDisconnect();
    }
  }

  void _handleDisconnect() {
    connected = false;
    notifyListeners();
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_reconnectAttempts >= _maxReconnectAttempts) {
      debugPrint('Max reconnect attempts reached');
      return;
    }

    _reconnectAttempts++;
    Future.delayed(const Duration(seconds: 2), () {
      if (!connected) {
        _connectWebSocket();
      }
    });
  }

  void _handleMessage(dynamic data) {
    try {
      final json = jsonDecode(data as String) as Map<String, dynamic>;
      final type = json['type'] as String?;
      final eventData = json['data'] as Map<String, dynamic>?;

      switch (type) {
        case 'bridge:stats':
          if (eventData != null) {
            bridge = BridgeState.fromJson(eventData);
          }
          break;

        case 'doctor:state':
          if (eventData != null) {
            doctor = DoctorState.fromJson(eventData);
          }
          break;

        case 'igor:spawned':
          if (eventData != null) {
            final id = eventData['id'] as String;
            igors[id] = IgorState.fromJson(eventData);
            _addStreamEvent('doctor', 'igor:spawned', '$id spawned');
          }
          break;

        case 'igor:state':
          if (eventData != null) {
            final id = eventData['id'] as String;
            igors[id] = IgorState.fromJson(eventData);
          }
          break;

        case 'igor:task_start':
          if (eventData != null) {
            final igorId = eventData['igorId'] as String;
            final tool = eventData['tool'] as String;
            if (igors.containsKey(igorId)) {
              igors[igorId] = igors[igorId]!.copyWith(
                status: 'busy',
                currentTask: TaskInfo(tool: tool, startedAt: DateTime.now()),
              );
            }
            _addStreamEvent('igor', 'task:start', '$igorId → $tool', sourceId: igorId);
          }
          break;

        case 'igor:task_end':
          if (eventData != null) {
            final igorId = eventData['igorId'] as String;
            final duration = eventData['duration'] as int?;
            final status = eventData['status'] as String?;
            if (igors.containsKey(igorId)) {
              igors[igorId] = igors[igorId]!.copyWith(
                status: 'idle',
                currentTask: null,
              );
            }
            final icon = status == 'success' ? '✓' : '✗';
            _addStreamEvent('igor', 'task:complete', '$igorId $icon ${duration}ms', sourceId: igorId);
          }
          break;

        case 'igor:terminated':
          if (eventData != null) {
            final id = eventData['id'] as String;
            final reason = eventData['reason'] as String? ?? 'unknown';
            igors.remove(id);
            _addStreamEvent('doctor', 'igor:terminated', '$id - $reason');
          }
          break;

        case 'stream':
          if (eventData != null) {
            _addStreamEvent(
              eventData['source'] as String? ?? 'unknown',
              eventData['type'] as String? ?? 'event',
              eventData['summary'] as String? ?? '',
              sourceId: eventData['sourceId'] as String?,
              level: eventData['level'] as String? ?? 'info',
            );
          }
          break;

        case 'mcp:request':
          final tool = eventData?['tool'] as String? ?? eventData?['method'] as String? ?? 'unknown';
          _addStreamEvent('bridge', 'mcp:request', tool);
          break;

        case 'mcp:response':
          _addStreamEvent('bridge', 'mcp:response', '→ Claude');
          break;
      }

      notifyListeners();
    } catch (e) {
      debugPrint('Error handling message: $e');
    }
  }

  void _addStreamEvent(String source, String type, String summary, {String? sourceId, String level = 'info'}) {
    stream.insert(0, StreamEvent(
      timestamp: DateTime.now(),
      source: source,
      sourceId: sourceId,
      type: type,
      summary: summary,
      level: level,
    ));

    // Keep max 1000 events
    if (stream.length > 1000) {
      stream.removeLast();
    }
  }

  void sendCommand(String action, [Map<String, dynamic>? params]) {
    if (_channel == null) return;

    final message = {'action': action, ...?params};
    _channel!.sink.add(jsonEncode(message));
  }

  // Actions
  void restartDoctor() => sendCommand('doctor:restart');
  void pauseTraffic() {
    paused = true;
    sendCommand('bridge:pause');
    notifyListeners();
  }
  void resumeTraffic() {
    paused = false;
    sendCommand('bridge:resume');
    notifyListeners();
  }
  void killIgor(String id) => sendCommand('igor:kill', {'id': id});
  void spawnIgor({String? domain}) => sendCommand('igor:spawn', {'domain': domain});
  void cancelSwarm(String id) => sendCommand('swarm:cancel', {'id': id});
  void shutdownBridge() => sendCommand('bridge:shutdown');

  void clearStream() {
    stream.clear();
    notifyListeners();
  }

  void toggleAutoScroll() {
    autoScroll = !autoScroll;
    notifyListeners();
  }

  void setStreamFilter(StreamFilter filter) {
    streamFilter = filter;
    notifyListeners();
  }

  void toggleCommandPalette() {
    commandPaletteOpen = !commandPaletteOpen;
    notifyListeners();
  }

  void closeCommandPalette() {
    commandPaletteOpen = false;
    notifyListeners();
  }

  // Filtered stream
  List<StreamEvent> get filteredStream {
    var filtered = stream;

    if (streamFilter.source != 'all') {
      filtered = filtered.where((e) => e.source == streamFilter.source).toList();
    }

    if (streamFilter.search.isNotEmpty) {
      final q = streamFilter.search.toLowerCase();
      filtered = filtered.where((e) =>
        e.summary.toLowerCase().contains(q) ||
        e.type.toLowerCase().contains(q)
      ).toList();
    }

    return filtered;
  }

  // Load demo data for testing
  void loadDemoData() {
    bridge = BridgeState(
      status: 'running',
      uptime: 9420,
      doctorStatus: 'ready',
      doctorRestarts: 0,
      messagesIn: 847,
      messagesOut: 845,
    );

    doctor = DoctorState(
      status: 'ready',
      uptime: 9420,
      activeTasks: 3,
      queuedTasks: 12,
      igorCount: 4,
      maxIgors: 8,
      swarms: [
        SwarmInfo(id: 'swarm-1', name: 'a11y-audit', progress: 67, igorCount: 3),
      ],
      squads: [
        SquadInfo(name: 'browser-team', igorIds: ['igor-001', 'igor-003']),
      ],
    );

    igors = {
      'igor-001': IgorState(
        id: 'igor-001',
        status: 'busy',
        domain: 'browser',
        memoryMB: 127,
        browserPages: 2,
        currentTask: TaskInfo(tool: 'browser_screenshot', startedAt: DateTime.now().subtract(const Duration(seconds: 2))),
      ),
      'igor-002': IgorState(
        id: 'igor-002',
        status: 'idle',
        domain: 'database',
        memoryMB: 45,
        dbConnections: 3,
      ),
      'igor-003': IgorState(
        id: 'igor-003',
        status: 'busy',
        domain: 'github',
        memoryMB: 52,
        currentTask: TaskInfo(tool: 'gh_pr_create', startedAt: DateTime.now().subtract(const Duration(milliseconds: 800))),
      ),
    };

    _addStreamEvent('bridge', 'mcp:request', 'browser_screenshot');
    _addStreamEvent('doctor', 'task:dispatch', '→ igor-001');
    _addStreamEvent('igor', 'task:start', 'igor-001 → browser_screenshot', sourceId: 'IGOR-001');
    _addStreamEvent('igor', 'task:complete', 'igor-001 ✓ 765ms', sourceId: 'IGOR-001');
    _addStreamEvent('bridge', 'mcp:response', '→ Claude');
    _addStreamEvent('doctor', 'swarm:progress', 'a11y-audit 67%');

    notifyListeners();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _channel?.sink.close();
    super.dispose();
  }
}
