import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibration/vibration.dart';

/// Plays the sound and the vibration. Separate so tests can swap in a fake.
abstract class AlertOutput {
  Future<void> play();
  Future<void> vibrate(List<int> pattern);
  Future<void> cancel();
}

/// Real phone output: assets/sounds/new_offer.wav (bright four-note chime, played twice, 2.3 s)
/// and a short-short-long vibration.
class DeviceAlertOutput implements AlertOutput {
  AudioPlayer? _player;

  Future<AudioPlayer> _ready() async {
    final existing = _player;
    if (existing != null) return existing;
    final p = AudioPlayer();
    await p.setReleaseMode(ReleaseMode.stop);
    // iOS: "playback" so the offer is heard with the ringer switch on silent; mixes with music or navigation.
    // Android: plays on the notification/ringtone stream and briefly lowers other audio.
    await p.setAudioContext(AudioContext(
      iOS: AudioContextIOS(category: AVAudioSessionCategory.playback, options: const {AVAudioSessionOptions.mixWithOthers}),
      android: const AudioContextAndroid(
        contentType: AndroidContentType.sonification,
        usageType: AndroidUsageType.notificationRingtone,
        audioFocus: AndroidAudioFocus.gainTransientMayDuck,
      ),
    ));
    return _player = p;
  }

  @override
  Future<void> play() async {
    final p = await _ready();
    await p.stop();
    await p.play(AssetSource('sounds/new_offer.wav'), volume: 1.0);
  }

  @override
  Future<void> vibrate(List<int> pattern) async {
    if (await Vibration.hasVibrator() != true) return;
    await Vibration.vibrate(pattern: pattern);
  }

  @override
  Future<void> cancel() async {
    await _player?.stop();
    await Vibration.cancel();
  }
}

/// Rings for a new offer: chime + vibration right away, then again every [repeatEvery]
/// until the driver accepts or declines, or the offer expires. Settings are saved on the phone.
class OfferAlert extends ChangeNotifier {
  OfferAlert({AlertOutput? output, this.repeatEvery = const Duration(seconds: 4)}) : _output = output ?? DeviceAlertOutput();

  static const soundKey = 'offer_alert_sound';
  static const vibrateKey = 'offer_alert_vibrate';
  /// Wait, buzz, wait, buzz, ... in milliseconds: short, short, long.
  static const vibrationPattern = [0, 140, 70, 140, 70, 420];

  final AlertOutput _output;
  final Duration repeatEvery;
  bool sound = true;
  bool vibrate = true;
  String? ringingFor;
  Timer? _timer;

  bool get ringing => ringingFor != null;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    sound = prefs.getBool(soundKey) ?? true;
    vibrate = prefs.getBool(vibrateKey) ?? true;
    notifyListeners();
  }

  Future<void> setSound(bool on) async {
    sound = on;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setBool(soundKey, on);
  }

  Future<void> setVibrate(bool on) async {
    vibrate = on;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setBool(vibrateKey, on);
  }

  /// Starts ringing for [offerId]. Calling again for the same offer does nothing, so polling never restarts it.
  void start(String offerId) {
    if (ringingFor == offerId) return;
    _timer?.cancel();
    ringingFor = offerId;
    _ringOnce();
    _timer = Timer.periodic(repeatEvery, (_) => _ringOnce());
  }

  void stop() {
    if (ringingFor == null) return;
    _timer?.cancel();
    _timer = null;
    ringingFor = null;
    _safe(_output.cancel);
  }

  /// "Play the offer sound" in Account.
  void test() => _ringOnce();

  void _ringOnce() {
    if (sound) _safe(_output.play);
    if (vibrate) _safe(() => _output.vibrate(vibrationPattern));
  }

  void _safe(Future<void> Function() fn) {
    fn().catchError((Object e) => debugPrint('OfferAlert: $e'));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
