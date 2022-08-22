import { ProposalCategory, TemplatedProposalsConfigMap } from '@custom-types/types';

import part2 from '@proposals/description/part2';

export const ProposalsConfig: TemplatedProposalsConfigMap = {
  tip_119: {
    deploy: false, // deploy flag for whether to run deploy action during e2e tests or use mainnet state
    totalValue: 0, // amount of ETH to send to DAO execution
    proposal: part2, // full proposal file, imported from '@proposals/description/fip_xx.ts'
    proposalId: '',
    affectedContractSignoff: [],
    deprecatedContractSignoff: [],
    category: ProposalCategory.DAO
  }
};
