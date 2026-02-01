import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// NightmareRectangle - 16 TikTok-style videos playing simultaneously
///
/// This is a stress test app for E2E testing frameworks.
/// Tests: GPU rendering, multiple video decoders, memory pressure,
/// scroll performance, touch targets in dense layouts.

void main() {
  runApp(const NightmareRectangleApp());
}

class NightmareRectangleApp extends StatelessWidget {
  const NightmareRectangleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NightmareRectangle',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: Colors.black,
      ),
      home: const NightmareGrid(),
    );
  }
}

class NightmareGrid extends StatefulWidget {
  const NightmareGrid({super.key});

  @override
  State<NightmareGrid> createState() => _NightmareGridState();
}

class _NightmareGridState extends State<NightmareGrid> {
  final List<VideoPlayerController> _controllers = [];
  bool _isInitialized = false;
  int _initializedCount = 0;

  // 16 fake TikTok video URLs - using local assets or network fallbacks
  final List<String> _videoSources = List.generate(
    16,
    (i) => 'assets/videos/fake_tiktok_${i.toString().padLeft(2, '0')}.webm',
  );

  @override
  void initState() {
    super.initState();
    _initializeVideos();
  }

  Future<void> _initializeVideos() async {
    for (int i = 0; i < 16; i++) {
      final controller = VideoPlayerController.asset(_videoSources[i]);
      _controllers.add(controller);

      controller.initialize().then((_) {
        controller.setLooping(true);
        controller.setVolume(i == 0 ? 0.3 : 0.0); // Only first video has sound
        controller.play();

        setState(() {
          _initializedCount++;
          if (_initializedCount == 16) {
            _isInitialized = true;
          }
        });
      }).catchError((e) {
        // Fallback: use colored placeholder if video fails
        debugPrint('Video $i failed to load: $e');
        setState(() {
          _initializedCount++;
          if (_initializedCount == 16) {
            _isInitialized = true;
          }
        });
      });
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NightmareRectangle'),
        backgroundColor: Colors.black,
        actions: [
          IconButton(
            icon: const Icon(Icons.pause),
            onPressed: _pauseAll,
            tooltip: 'Pause All',
          ),
          IconButton(
            icon: const Icon(Icons.play_arrow),
            onPressed: _playAll,
            tooltip: 'Play All',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _resetAll,
            tooltip: 'Reset All',
          ),
        ],
      ),
      body: Column(
        children: [
          // Status bar
          Container(
            padding: const EdgeInsets.all(8),
            color: Colors.grey[900],
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                Text('Videos: $_initializedCount/16'),
                Text('Status: ${_isInitialized ? "NIGHTMARE ACTIVE" : "Loading..."}'),
                _buildMemoryIndicator(),
              ],
            ),
          ),
          // 4x4 Grid of videos
          Expanded(
            child: GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 4,
                childAspectRatio: 9 / 16, // TikTok aspect ratio
                crossAxisSpacing: 2,
                mainAxisSpacing: 2,
              ),
              itemCount: 16,
              itemBuilder: (context, index) => _buildVideoCell(index),
            ),
          ),
          // Control panel
          Container(
            padding: const EdgeInsets.all(16),
            color: Colors.grey[900],
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildActionButton('CHAOS', Icons.shuffle, _shuffleVideos),
                _buildActionButton('SYNC', Icons.sync, _syncVideos),
                _buildActionButton('MUTE', Icons.volume_off, _muteAll),
                _buildActionButton('UNMUTE', Icons.volume_up, _unmuteAll),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVideoCell(int index) {
    final hasController = index < _controllers.length;
    final controller = hasController ? _controllers[index] : null;
    final isReady = controller?.value.isInitialized ?? false;

    return GestureDetector(
      onTap: () => _toggleVideo(index),
      onDoubleTap: () => _likeVideo(index),
      onLongPress: () => _showVideoInfo(index),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Video or placeholder
          if (isReady)
            VideoPlayer(controller!)
          else
            _buildPlaceholder(index),

          // Overlay with index and controls
          Positioned(
            top: 4,
            left: 4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                '#${index + 1}',
                style: const TextStyle(fontSize: 10, color: Colors.white),
              ),
            ),
          ),

          // Play/pause indicator
          if (isReady && !(controller?.value.isPlaying ?? false))
            const Center(
              child: Icon(Icons.play_circle_outline, color: Colors.white54, size: 32),
            ),

          // Like animation target
          Positioned(
            bottom: 8,
            right: 8,
            child: Column(
              children: [
                Icon(Icons.favorite_border, color: Colors.white.withOpacity(0.7), size: 20),
                const SizedBox(height: 4),
                Icon(Icons.comment, color: Colors.white.withOpacity(0.7), size: 20),
                const SizedBox(height: 4),
                Icon(Icons.share, color: Colors.white.withOpacity(0.7), size: 20),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlaceholder(int index) {
    // Colorful placeholder that simulates video content
    final colors = [
      Colors.red, Colors.pink, Colors.purple, Colors.deepPurple,
      Colors.indigo, Colors.blue, Colors.lightBlue, Colors.cyan,
      Colors.teal, Colors.green, Colors.lightGreen, Colors.lime,
      Colors.yellow, Colors.amber, Colors.orange, Colors.deepOrange,
    ];

    return Container(
      color: colors[index % colors.length].withOpacity(0.3),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(strokeWidth: 2),
            const SizedBox(height: 8),
            Text(
              'Loading #${index + 1}',
              style: const TextStyle(fontSize: 10, color: Colors.white70),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMemoryIndicator() {
    return Row(
      children: [
        const Icon(Icons.memory, size: 16),
        const SizedBox(width: 4),
        Container(
          width: 60,
          height: 8,
          decoration: BoxDecoration(
            color: Colors.grey[800],
            borderRadius: BorderRadius.circular(4),
          ),
          child: FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: _initializedCount / 16,
            child: Container(
              decoration: BoxDecoration(
                color: _initializedCount < 8 ? Colors.green :
                       _initializedCount < 14 ? Colors.orange : Colors.red,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionButton(String label, IconData icon, VoidCallback onPressed) {
    return ElevatedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 16),
      label: Text(label, style: const TextStyle(fontSize: 12)),
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.grey[800],
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
    );
  }

  void _toggleVideo(int index) {
    if (index >= _controllers.length) return;
    final controller = _controllers[index];
    if (controller.value.isInitialized) {
      if (controller.value.isPlaying) {
        controller.pause();
      } else {
        controller.play();
      }
      setState(() {});
    }
  }

  void _likeVideo(int index) {
    // Simulate like animation
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Liked video #${index + 1}!'),
        duration: const Duration(milliseconds: 500),
      ),
    );
  }

  void _showVideoInfo(int index) {
    if (index >= _controllers.length) return;
    final controller = _controllers[index];
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Video #${index + 1}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Initialized: ${controller.value.isInitialized}'),
            Text('Playing: ${controller.value.isPlaying}'),
            Text('Duration: ${controller.value.duration}'),
            Text('Position: ${controller.value.position}'),
            Text('Size: ${controller.value.size}'),
            Text('Volume: ${controller.value.volume}'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _pauseAll() {
    for (final controller in _controllers) {
      if (controller.value.isInitialized) {
        controller.pause();
      }
    }
    setState(() {});
  }

  void _playAll() {
    for (final controller in _controllers) {
      if (controller.value.isInitialized) {
        controller.play();
      }
    }
    setState(() {});
  }

  void _resetAll() {
    for (final controller in _controllers) {
      if (controller.value.isInitialized) {
        controller.seekTo(Duration.zero);
        controller.play();
      }
    }
    setState(() {});
  }

  void _shuffleVideos() {
    // Randomize playback speeds for chaos
    for (int i = 0; i < _controllers.length; i++) {
      final controller = _controllers[i];
      if (controller.value.isInitialized) {
        final speed = 0.5 + (i % 4) * 0.5; // 0.5x to 2x
        controller.setPlaybackSpeed(speed);
      }
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('CHAOS MODE: Random speeds activated!')),
    );
  }

  void _syncVideos() {
    for (final controller in _controllers) {
      if (controller.value.isInitialized) {
        controller.seekTo(Duration.zero);
        controller.setPlaybackSpeed(1.0);
        controller.play();
      }
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('All videos synchronized!')),
    );
  }

  void _muteAll() {
    for (final controller in _controllers) {
      if (controller.value.isInitialized) {
        controller.setVolume(0);
      }
    }
    setState(() {});
  }

  void _unmuteAll() {
    for (int i = 0; i < _controllers.length; i++) {
      final controller = _controllers[i];
      if (controller.value.isInitialized) {
        // Stagger volumes to create audio chaos
        controller.setVolume(0.1 + (i % 4) * 0.1);
      }
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Audio nightmare unleashed!')),
    );
  }
}
