import useRealm from '@hooks/useRealm'
import React, { useMemo, useState } from 'react'
import useWalletStore from 'stores/useWalletStore'
import {
  ProposalState,
  Vote,
  withCastVote,
  YesNoVote,
} from '@solana/spl-governance'
import { CheckCircleIcon } from '@heroicons/react/outline'
import { Transaction, TransactionInstruction } from '@solana/web3.js'
import { sendSignedTransaction } from '@utils/sendTransactions'
import { notify } from '@utils/notifications'
import Loading from '@components/Loading'
import useVotePluginsClientStore from 'stores/useVotePluginsClientStore'
import { NftVoterClient } from '@solana/governance-program-library'
import { LinkButton } from '@components/Button'

const ApproveAllBtn = () => {
  const wallet = useWalletStore((s) => s.current)
  const connected = useWalletStore((s) => s.connected)
  const { current: connection } = useWalletStore((s) => s.connection)
  const ownVoteRecordsByProposal = useWalletStore(
    (s) => s.ownVoteRecordsByProposal
  )

  const client = useVotePluginsClientStore(
    (s) => s.state.currentRealmVotingClient
  )
  const { proposals, realmInfo, realm, tokenRecords } = useRealm()
  const [isLoading, setIsLoading] = useState(false)
  const refetchProposals = useWalletStore((s) => s.actions.refetchProposals)
  const votingProposals = useMemo(
    () =>
      Object.values(proposals).filter(
        (p) =>
          p.account.state == ProposalState.Voting &&
          !ownVoteRecordsByProposal[p.pubkey.toBase58()]
      ),
    [proposals, ownVoteRecordsByProposal]
  )

  const canApproveProposals = connected && votingProposals.length > 0

  const approveAll = async () => {
    if (!wallet || !realmInfo!.programId || !realm) return

    const governanceAuthority = wallet.publicKey!
    const payer = wallet.publicKey!

    try {
      setIsLoading(true)
      const {
        blockhash: recentBlockhash,
      } = await connection.getLatestBlockhash()

      const transactions: Transaction[] = []
      for (let i = 0; i < votingProposals.length; i++) {
        const proposal = votingProposals[i]
        const ownTokenRecord = tokenRecords[wallet.publicKey!.toBase58()]

        const instructions: TransactionInstruction[] = []

        //will run only if plugin is connected with realm
        const plugin = await client?.withCastPluginVote(
          instructions,
          proposal.pubkey
        )
        if (client.client instanceof NftVoterClient === false) {
          await withCastVote(
            instructions,
            realmInfo!.programId,
            realmInfo!.programVersion!,
            realm.pubkey,
            proposal.account.governance,
            proposal.pubkey,
            proposal.account.tokenOwnerRecord,
            ownTokenRecord.pubkey,
            governanceAuthority,
            proposal.account.governingTokenMint,
            Vote.fromYesNoVote(YesNoVote.Yes),
            payer,
            plugin?.voterWeightPk,
            plugin?.maxVoterWeightRecord
          )
        }

        const transaction = new Transaction()
        transaction.add(...instructions)
        transaction.recentBlockhash = recentBlockhash
        transaction.setSigners(
          // fee payed by the wallet owner
          wallet.publicKey!
        )
        transactions.push(transaction)
      }
      const signedTXs = await wallet.signAllTransactions(transactions)
      await Promise.all(
        signedTXs.map((transaction) =>
          sendSignedTransaction({ signedTransaction: transaction, connection })
        )
      )
      await refetchProposals()
      notify({
        message: 'Successfully voted on all proposals',
        type: 'success',
      })
    } catch (e) {
      notify({ type: 'erorr', message: `Something went wrong, ${e}` })
    }
    setIsLoading(false)
  }

  return canApproveProposals ? (
    isLoading ? (
      <Loading />
    ) : (
      <LinkButton
        className={`default-transition flex items-center text-primary-light text-sm hover:text-primary-dark hover:opacity-100`}
        onClick={approveAll}
      >
        <CheckCircleIcon className="h-5 mr-1 w-5" />
        Approve All
      </LinkButton>
    )
  ) : null
}

export default ApproveAllBtn
