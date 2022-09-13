// This config lists all of the contracts that (should) be hold each listed role.

export const PermissionsConfig = {
  MINTER_ROLE: ['feiDAOTimelock', 'pcvEquityMinter', 'daiFixedPricePSM'],
  BURNER_ROLE: [],
  GOVERN_ROLE: ['core', 'feiDAOTimelock', 'roleBastion'],
  PCV_CONTROLLER_ROLE: [
    'feiDAOTimelock',
    'ratioPCVControllerV2',
    'pcvGuardian',
    'daiPCVDripController',
    'daiFixedPricePSMFeiSkimmer'
  ],
  GUARDIAN_ROLE: ['guardianMultisig', 'pcvGuardian', 'pcvSentinel'],
  ORACLE_ADMIN_ROLE: [],
  SWAP_ADMIN_ROLE: ['pcvEquityMinter'],
  BALANCER_MANAGER_ADMIN_ROLE: [],
  RATE_LIMITED_MINTER_ADMIN: [],
  PARAMETER_ADMIN: [],
  PSM_ADMIN_ROLE: [],
  TRIBAL_CHIEF_ADMIN_ROLE: [],
  FUSE_ADMIN: [],
  VOTIUM_ADMIN_ROLE: [],
  PCV_GUARDIAN_ADMIN_ROLE: [],
  PCV_SAFE_MOVER_ROLE: [],
  METAGOVERNANCE_VOTE_ADMIN: ['feiDAOTimelock'],
  METAGOVERNANCE_TOKEN_STAKING: ['feiDAOTimelock'],
  METAGOVERNANCE_GAUGE_ADMIN: ['feiDAOTimelock'],
  ROLE_ADMIN: ['feiDAOTimelock', 'tribalCouncilTimelock'],
  POD_METADATA_REGISTER_ROLE: [],
  FEI_MINT_ADMIN: ['feiDAOTimelock'],
  POD_VETO_ADMIN: ['nopeDAO'],
  POD_ADMIN: [],
  PCV_MINOR_PARAM_ROLE: ['feiDAOTimelock'],
  TOKEMAK_DEPOSIT_ADMIN_ROLE: ['feiDAOTimelock', 'tribalCouncilTimelock']
};

export type PermissionsConfigType = typeof PermissionsConfig;
