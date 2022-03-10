type PodConfig = {
  members: string[];
  threshold: number;
  podLabel: string;
  ensString: string;
  imageUrl: string;
  minDelay: number;
  numMembers: number;
};

export const tribalCouncilMembers = [
  '0x0000000000000000000000000000000000000004', // TODO: Complete with real member addresses
  '0x0000000000000000000000000000000000000005',
  '0x0000000000000000000000000000000000000006',
  '0x0000000000000000000000000000000000000007',
  '0x0000000000000000000000000000000000000008',
  '0x0000000000000000000000000000000000000009',
  '0x000000000000000000000000000000000000000a',
  '0x000000000000000000000000000000000000000b',
  '0x000000000000000000000000000000000000000c'
];

export const placeHolderCouncilMembers = [
  '0x0000000000000000000000000000000000000004',
  '0x0000000000000000000000000000000000000005',
  '0x0000000000000000000000000000000000000006',
  '0x0000000000000000000000000000000000000007',
  '0x0000000000000000000000000000000000000008',
  '0x0000000000000000000000000000000000000009',
  '0x000000000000000000000000000000000000000a',
  '0x000000000000000000000000000000000000000b',
  '0x000000000000000000000000000000000000000c'
];

export const tribeCouncilPodConfig: PodConfig = {
  members: tribalCouncilMembers,
  threshold: 5,
  podLabel: 'Tribe Council',
  ensString: 'tribalCouncil.eth',
  imageUrl: 'tribalCouncil.com',
  minDelay: 345600,
  numMembers: tribalCouncilMembers.length
};

export const protocolPodMembers = [
  '0x0000000000000000000000000000000000000004', // TODO: Complete with real member addresses
  '0x0000000000000000000000000000000000000005',
  '0x0000000000000000000000000000000000000006',
  '0x0000000000000000000000000000000000000007',
  '0x0000000000000000000000000000000000000008'
];

export const placeHolderPodMembers = [
  '0x0000000000000000000000000000000000000004',
  '0x0000000000000000000000000000000000000005',
  '0x0000000000000000000000000000000000000006',
  '0x0000000000000000000000000000000000000007',
  '0x0000000000000000000000000000000000000008'
];

export const protocolPodConfig: PodConfig = {
  members: protocolPodMembers,
  threshold: 3,
  podLabel: 'ProtocolPod',
  ensString: 'protocolPod.eth',
  imageUrl: 'protocolPod.com',
  minDelay: 0,
  numMembers: protocolPodMembers.length
};
