import { useState, useRef, useCallback } from 'react';
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
  Image as ImageIcon,
  Radio,
} from 'lucide-react';
import { submitReport } from '../api';

const STATUS = { idle: 'idle', locating: 'locating', sending: 'sending', success: 'success', error: 'error' };

export default function FieldPortal() {
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState(STATUS.idle);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

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
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    setStatus(STATUS.sending);
    setError('');
    try {
      const res = await submitReport({
        description: description.trim(),
        image: image || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        worker_id: 'field-portal',
      });
      setResult(res);
      setStatus(STATUS.success);
      // Reset form after brief display
      setTimeout(() => {
        setDescription('');
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
        {/* Description */}
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

        {/* Image */}
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

        {/* GPS */}
        <div className="field-group">
          <label className="field-label">
            <MapPin size={14} strokeWidth={2.2} />
            Location
          </label>
          {coords ? (
            <div className="field-gps-display">
              <Navigation size={14} />
              <span className="field-gps-coords">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
              <button type="button" className="field-gps-clear" onClick={() => setCoords(null)}>
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="field-gps-btn"
              onClick={acquireGPS}
              disabled={status === STATUS.locating}
            >
              {status === STATUS.locating ? (
                <>
                  <Loader size={16} className="field-spin" />
                  Acquiring GPS…
                </>
              ) : (
                <>
                  <MapPin size={16} />
                  Tag current location
                </>
              )}
            </button>
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
          disabled={!description.trim() || status === STATUS.sending || status === STATUS.success}
        >
          {status === STATUS.sending ? (
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
