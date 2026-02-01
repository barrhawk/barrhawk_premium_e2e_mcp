class BridgeState {
  final String status;
  final int uptime;
  final String doctorStatus;
  final int doctorRestarts;
  final int messagesIn;
  final int messagesOut;
  final int bytesIn;
  final int bytesOut;

  BridgeState({
    this.status = 'unknown',
    this.uptime = 0,
    this.doctorStatus = 'unknown',
    this.doctorRestarts = 0,
    this.messagesIn = 0,
    this.messagesOut = 0,
    this.bytesIn = 0,
    this.bytesOut = 0,
  });

  factory BridgeState.fromJson(Map<String, dynamic> json) {
    return BridgeState(
      status: json['status'] as String? ?? 'unknown',
      uptime: json['uptime'] as int? ?? 0,
      doctorStatus: json['doctorStatus'] as String? ?? 'unknown',
      doctorRestarts: json['doctorRestarts'] as int? ?? 0,
      messagesIn: json['messagesIn'] as int? ?? 0,
      messagesOut: json['messagesOut'] as int? ?? 0,
      bytesIn: json['bytesIn'] as int? ?? 0,
      bytesOut: json['bytesOut'] as int? ?? 0,
    );
  }
}

class DoctorState {
  final String status;
  final int uptime;
  final int activeTasks;
  final int queuedTasks;
  final int igorCount;
  final int maxIgors;
  final List<SwarmInfo> swarms;
  final List<SquadInfo> squads;

  DoctorState({
    this.status = 'unknown',
    this.uptime = 0,
    this.activeTasks = 0,
    this.queuedTasks = 0,
    this.igorCount = 0,
    this.maxIgors = 8,
    this.swarms = const [],
    this.squads = const [],
  });

  // Convenience getters
  int get activeSwarms => swarms.where((s) => s.status == 'running').length;
  int get queueDepth => queuedTasks;

  factory DoctorState.fromJson(Map<String, dynamic> json) {
    return DoctorState(
      status: json['status'] as String? ?? 'unknown',
      uptime: json['uptime'] as int? ?? 0,
      activeTasks: json['activeTasks'] as int? ?? 0,
      queuedTasks: json['queuedTasks'] as int? ?? 0,
      igorCount: json['igorCount'] as int? ?? 0,
      maxIgors: json['maxIgors'] as int? ?? 8,
      swarms: (json['swarms'] as List<dynamic>?)
          ?.map((s) => SwarmInfo.fromJson(s as Map<String, dynamic>))
          .toList() ?? [],
      squads: (json['squads'] as List<dynamic>?)
          ?.map((s) => SquadInfo.fromJson(s as Map<String, dynamic>))
          .toList() ?? [],
    );
  }
}

class SwarmInfo {
  final String id;
  final String name;
  final int progress;
  final int igorCount;
  final String status;

  SwarmInfo({
    required this.id,
    required this.name,
    this.progress = 0,
    this.igorCount = 0,
    this.status = 'running',
  });

  // Convenience getter for UI
  int get igorsAssigned => igorCount;

  factory SwarmInfo.fromJson(Map<String, dynamic> json) {
    return SwarmInfo(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      progress: json['progress'] as int? ?? 0,
      igorCount: json['igorCount'] as int? ?? 0,
      status: json['status'] as String? ?? 'running',
    );
  }
}

class SquadInfo {
  final String name;
  final List<String> igorIds;

  SquadInfo({
    required this.name,
    this.igorIds = const [],
  });

  factory SquadInfo.fromJson(Map<String, dynamic> json) {
    return SquadInfo(
      name: json['name'] as String? ?? '',
      igorIds: (json['igorIds'] as List<dynamic>?)?.cast<String>() ?? [],
    );
  }
}

class IgorState {
  final String id;
  final String status;
  final String domain;
  final int memoryMB;
  final int browserPages;
  final int dbConnections;
  final TaskInfo? currentTask;
  final int tasksCompleted;
  final int tasksFailed;
  final int cpuPercent;
  final int memoryPercent;

  IgorState({
    required this.id,
    this.status = 'idle',
    this.domain = 'general',
    this.memoryMB = 0,
    this.browserPages = 0,
    this.dbConnections = 0,
    this.currentTask,
    this.tasksCompleted = 0,
    this.tasksFailed = 0,
    this.cpuPercent = 0,
    this.memoryPercent = 0,
  });

  // Convenience getters for UI
  int get cpu => cpuPercent;
  int get memory => memoryPercent;

  factory IgorState.fromJson(Map<String, dynamic> json) {
    return IgorState(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'idle',
      domain: json['domain'] as String? ?? 'general',
      memoryMB: json['memoryMB'] as int? ?? 0,
      browserPages: json['browserPages'] as int? ?? 0,
      dbConnections: json['dbConnections'] as int? ?? 0,
      currentTask: json['currentTask'] != null
          ? TaskInfo.fromJson(json['currentTask'] as Map<String, dynamic>)
          : null,
      tasksCompleted: json['tasksCompleted'] as int? ?? 0,
      tasksFailed: json['tasksFailed'] as int? ?? 0,
      cpuPercent: json['cpuPercent'] as int? ?? json['cpu'] as int? ?? 0,
      memoryPercent: json['memoryPercent'] as int? ?? json['memory'] as int? ?? 0,
    );
  }

  IgorState copyWith({
    String? id,
    String? status,
    String? domain,
    int? memoryMB,
    int? browserPages,
    int? dbConnections,
    TaskInfo? currentTask,
    int? tasksCompleted,
    int? tasksFailed,
    int? cpuPercent,
    int? memoryPercent,
  }) {
    return IgorState(
      id: id ?? this.id,
      status: status ?? this.status,
      domain: domain ?? this.domain,
      memoryMB: memoryMB ?? this.memoryMB,
      browserPages: browserPages ?? this.browserPages,
      dbConnections: dbConnections ?? this.dbConnections,
      currentTask: currentTask,
      tasksCompleted: tasksCompleted ?? this.tasksCompleted,
      tasksFailed: tasksFailed ?? this.tasksFailed,
      cpuPercent: cpuPercent ?? this.cpuPercent,
      memoryPercent: memoryPercent ?? this.memoryPercent,
    );
  }
}

class TaskInfo {
  final String tool;
  final DateTime startedAt;

  TaskInfo({
    required this.tool,
    required this.startedAt,
  });

  factory TaskInfo.fromJson(Map<String, dynamic> json) {
    return TaskInfo(
      tool: json['tool'] as String? ?? '',
      startedAt: json['startedAt'] != null
          ? DateTime.parse(json['startedAt'] as String)
          : DateTime.now(),
    );
  }

  Duration get elapsed => DateTime.now().difference(startedAt);
}

class StreamEvent {
  final DateTime timestamp;
  final String source;
  final String? sourceId;
  final String type;
  final String summary;
  final String level;
  final int? durationMs;

  StreamEvent({
    required this.timestamp,
    required this.source,
    this.sourceId,
    required this.type,
    required this.summary,
    this.level = 'info',
    this.durationMs,
  });

  // Convenience getters for UI
  String get message => summary;
  int? get duration => durationMs;
}

class StreamFilter {
  final String source;
  final String search;

  StreamFilter({
    this.source = 'all',
    this.search = '',
  });

  StreamFilter copyWith({String? source, String? search}) {
    return StreamFilter(
      source: source ?? this.source,
      search: search ?? this.search,
    );
  }
}

class Command {
  final String id;
  final String title;
  final String icon;
  final String? hotkey;
  final String category;
  final void Function() handler;

  Command({
    required this.id,
    required this.title,
    this.icon = '▶',
    this.hotkey,
    required this.category,
    required this.handler,
  });
}
