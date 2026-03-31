import DecoupledHelperDevice from '../decoupled/DecoupledHelperDevice.jsx';

/**
 * Probe 3 Helper Device — thin wrapper around DecoupledHelperDevice
 * with purple accent and probe3 condition identifier.
 * Children (suggestion-routed tasks) are passed through.
 */
export default function HelperDevice(props) {
  return (
    <DecoupledHelperDevice
      {...props}
      condition="probe3"
      accentColor="#9B59B6"
    />
  );
}
