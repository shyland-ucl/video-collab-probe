import DecoupledCreatorDevice from '../decoupled/DecoupledCreatorDevice.jsx';

/**
 * Probe 3 Creator Device — thin wrapper around DecoupledCreatorDevice
 * with purple accent and probe3 condition identifier.
 * Children (suggestion UI) are passed through.
 */
export default function CreatorDevice(props) {
  return (
    <DecoupledCreatorDevice
      {...props}
      condition="probe3"
      accentColor="#9B59B6"
    />
  );
}
