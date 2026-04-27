import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera,
  MapPin,
  Send,
  CheckCircle,
  AlertTriangle,
  FileText,
  Loader,
  X,
  Navigation,
  Crosshair,
  Image as ImageIcon,
  Radio,
  Mic,
  MicOff,
} from 'lucide-react';
import { submitReport } from '../api';
import { showToast } from '../components/Toast';
import AudioVisualizer from '../components/AudioVisualizer';

const STATUS = { idle: 'idle', locating: 'locating', geocoding: 'geocoding', sending: 'sending', success: 'success', error: 'error' };
const AUDIO_ST = { idle: 'idle', recording: 'recording', done: 'done', submitting: 'submitting', saved: 'saved' };

export default function FieldPortal() {
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState(STATUS.idle);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Audio recording state
  const [audioStatus, setAudioStatus] = useState(AUDIO_ST.idle);
  const [micStream, setMicStream] = useState(null);
  const [audioBase64, setAudioBase64] = useState(null);

  const fileRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const toastShownRef = useRef(false);

  // Show feature-discovery toast once on mount
  useEffect(() => {
    if (toastShownRef.current) return;
    toastShownRef.current = true;
    const t = setTimeout(() => {
      showToast('🎙️ New Feature: You can now record and submit incident reports via audio!', 'success', 6000);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  // Stop mic tracks when stream changes or component unmounts
  useEffect(() => {
    return () => {
      micStream?.getTracks().forEach((t) => t.stop());
    };
  }, [micStream]);

  const handleImage = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  }, []);

  const clearImage = () => {
    setImage(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const acquireGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported on this device');
      return;
    }
    setStatus(STATUS.locating);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        setLocationText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setStatus(STATUS.idle);
      },
      (err) => {
        console.warn('[gps]', err);
        setError('Could not acquire GPS — submit without location or try again');
        setStatus(STATUS.idle);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // ── Audio recording ─────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      chunksRef.current = [];

      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        setMicStream(null);
        const reader = new FileReader();
        reader.onload = (ev) => {
          setAudioBase64(ev.target.result);
          setAudioStatus(AUDIO_ST.done);
        };
        reader.readAsDataURL(blob);
      };

      mr.start();
      setAudioStatus(AUDIO_ST.recording);
    } catch {
      setError('Microphone access denied — please allow mic permissions and try again.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setAudioStatus(AUDIO_ST.idle); // will flip to 'done' in onstop
  }, []);

  const clearAudio = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    micStream?.getTracks().forEach((t) => t.stop());
    setMicStream(null);
    setAudioBase64(null);
    setAudioStatus(AUDIO_ST.idle);
  }, [micStream]);

  const submitAudioReport = useCallback(() => {
    if (!audioBase64) return;
    setAudioStatus(AUDIO_ST.submitting);
    try {
      const existing = JSON.parse(localStorage.getItem('pending_audio_reports') || '[]');
      existing.push({
        id: Date.now(),
        type: 'audio',
        audioData: audioBase64,
        timestamp: new Date().toISOString(),
        status: 'pending',
      });
      localStorage.setItem('pending_audio_reports', JSON.stringify(existing));
      setAudioStatus(AUDIO_ST.saved);
      showToast('Your incident has been reported!', 'success', 4000);
      setTimeout(() => {
        setAudioBase64(null);
        setAudioStatus(AUDIO_ST.idle);
      }, 3000);
    } catch {
      setError('Could not save audio report — storage quota may be full. Try a shorter recording.');
      setAudioStatus(AUDIO_ST.done);
    }
  }, [audioBase64]);

  // ── Text/image form submit ───────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    setError('');

    let submitCoords = coords;

    if (!submitCoords && locationText.trim()) {
      setStatus(STATUS.geocoding);
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(locationText.trim())}`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const geoData = await geoRes.json();
        if (geoData.length > 0) {
          submitCoords = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };
        } else {
          setError('Could not find exact coordinates for that address. Please be more specific or use the GPS tag.');
          setStatus(STATUS.idle);
          return;
        }
      } catch {
        setError('Geocoding unavailable — report will be submitted without map coordinates.');
      }
    }

    setStatus(STATUS.sending);
    try {
      const res = await submitReport({
        description: description.trim(),
        image: image || undefined,
        lat: submitCoords?.lat,
        lng: submitCoords?.lng,
        location_text: locationText.trim() || undefined,
        worker_id: 'field-portal',
      });
      setResult(res);
      setStatus(STATUS.success);
      setTimeout(() => {
        setDescription('');
        setLocationText('');
        clearImage();
        setCoords(null);
        setResult(null);
        setStatus(STATUS.idle);
      }, 4000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Submission failed');
      setStatus(STATUS.error);
      setTimeout(() => setStatus(STATUS.idle), 2000);
    }
  };

  return (
    <div className="field-portal">
      <div className="field-hero">
        <div className="field-hero-content">
          <div className="field-icon-ring">
            <Radio size={28} strokeWidth={2} />
          </div>
          <h1>Field Report</h1>
          <p>Capture what you see. Photo, voice, or text — every observation matters.</p>
        </div>
      </div>

      <form className="field-form" onSubmit={handleSubmit}>
        {/* Observation */}
        <div className="field-group">
          <label className="field-label">
            <FileText size={14} strokeWidth={2.2} />
            Observation
          </label>
          <textarea
            className="field-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you observed — be specific about who is affected, the location, and the urgency..."
            rows={4}
            required
          />
        </div>

        {/* Audio Report */}
        <div className="field-group">
          <label className="field-label">
            <Mic size={14} strokeWidth={2.2} />
            Audio Report
            <span className="field-label-opt">Optional</span>
          </label>

          {audioStatus === AUDIO_ST.idle && (
            <button type="button" className="audio-record-btn" onClick={startRecording}>
              <div className="audio-record-icon">
                <Mic size={24} strokeWidth={1.8} />
              </div>
              <span className="audio-record-text">Start Recording</span>
              <span className="audio-record-hint">Tap to capture a voice report</span>
            </button>
          )}

          {audioStatus === AUDIO_ST.recording && (
            <div className="audio-recording-ui">
              <div className="audio-recording-header">
                <span className="audio-rec-dot" />
                <span className="audio-rec-label">Recording…</span>
              </div>
              <AudioVisualizer stream={micStream} />
              <button type="button" className="audio-stop-btn" onClick={stopRecording}>
                <MicOff size={14} strokeWidth={2} />
                Stop Recording
              </button>
            </div>
          )}

          {(audioStatus === AUDIO_ST.done || audioStatus === AUDIO_ST.submitting || audioStatus === AUDIO_ST.saved) && audioBase64 && (
            <div className="audio-preview-wrap">
              <audio controls src={audioBase64} className="audio-preview-player" />
              <div className="audio-preview-actions">
                <button
                  type="button"
                  className="audio-submit-btn"
                  onClick={submitAudioReport}
                  disabled={audioStatus === AUDIO_ST.submitting || audioStatus === AUDIO_ST.saved}
                >
                  {audioStatus === AUDIO_ST.submitting ? (
                    <><Loader size={14} className="field-spin" /> Saving…</>
                  ) : audioStatus === AUDIO_ST.saved ? (
                    <><CheckCircle size={14} /> Reported!</>
                  ) : (
                    <><Send size={14} /> Submit Audio Report</>
                  )}
                </button>
                <button
                  type="button"
                  className="audio-clear-btn"
                  onClick={clearAudio}
                  disabled={audioStatus === AUDIO_ST.submitting}
                >
                  <X size={13} />
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Photo Evidence */}
        <div className="field-group">
          <label className="field-label">
            <Camera size={14} strokeWidth={2.2} />
            Photo Evidence
            <span className="field-label-opt">Optional</span>
          </label>
          {preview ? (
            <div className="field-preview">
              <img src={preview} alt="Captured" />
              <button type="button" className="field-preview-clear" onClick={clearImage}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="field-capture-btn"
              onClick={() => fileRef.current?.click()}
            >
              <div className="field-capture-icon">
                <ImageIcon size={28} strokeWidth={1.5} />
              </div>
              <span className="field-capture-text">Tap to attach photo</span>
              <span className="field-capture-hint">JPG, PNG — max 10 MB</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImage}
            hidden
          />
        </div>

        {/* Location — hybrid text + GPS */}
        <div className="field-group">
          <label className="field-label">
            <MapPin size={14} strokeWidth={2.2} />
            Location
            <span className="field-label-opt">Optional</span>
          </label>
          <div className="field-location-wrap">
            <input
              className="field-location-input"
              type="text"
              value={locationText}
              onChange={(e) => {
                setLocationText(e.target.value);
                if (coords) setCoords(null);
              }}
              placeholder="Type address manually or tag GPS…"
            />
            <button
              type="button"
              className={`field-location-gps${status === STATUS.locating ? ' locating' : ''}`}
              onClick={acquireGPS}
              disabled={status === STATUS.locating}
              title="Tag current GPS location"
              aria-label="Tag current GPS location"
            >
              {status === STATUS.locating
                ? <Loader size={15} className="field-spin" />
                : <Crosshair size={15} strokeWidth={2} />
              }
            </button>
          </div>
          {coords && (
            <span className="field-gps-tag">
              <Navigation size={11} />
              GPS tagged · {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="field-error">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="field-submit"
          disabled={!description.trim() || status === STATUS.geocoding || status === STATUS.sending || status === STATUS.success}
        >
          {status === STATUS.geocoding ? (
            <>
              <Loader size={16} className="field-spin" />
              Locating…
            </>
          ) : status === STATUS.sending ? (
            <>
              <Loader size={16} className="field-spin" />
              Transmitting…
            </>
          ) : status === STATUS.success ? (
            <>
              <CheckCircle size={16} />
              Report Received
            </>
          ) : (
            <>
              <Send size={16} />
              Submit Report
            </>
          )}
        </button>

        {/* Success detail */}
        {result && status === STATUS.success && (
          <div className="field-success">
            <CheckCircle size={16} />
            <div>
              <strong>Report #{result.report_id?.slice(-6)} queued</strong>
              {result.extracted_fields?.category && (
                <span className="field-success-cat">
                  Category: {result.extracted_fields.category}
                </span>
              )}
              {result.impact_score != null && (
                <span className="field-success-score">
                  Impact: {Number(result.impact_score).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
