# Code Bounty Escrow Smart Contract

A comprehensive Stacks smart contract for managing code bounties with built-in escrow functionality, verification systems, and dispute resolution. This contract enables secure, trustless bounty payments for software development tasks.

## 🚀 Features

### Core Bounty Management
- **Create Bounties**: Post coding tasks with detailed requirements and deadlines
- **Escrow System**: Automatic fund locking and secure payment release
- **Assignment System**: Assign bounties to specific developers or keep them open
- **Priority & Difficulty Levels**: Categorize bounties by urgency and complexity
- **Flexible Deadlines**: Set custom deadlines with automatic expiration

### Verification & Quality Control
- **Multi-Level Verification**: Bounty creators and trusted verifiers can review submissions
- **Trusted Verifier Registry**: Maintain a list of domain experts for specialized reviews
- **Verification Timeout**: Automatic handling of overdue verifications
- **Detailed Feedback**: Support for verification notes and improvement suggestions

### Payment & Economics
- **Automatic Fee Calculation**: Built-in platform fee system (default 2.5%)
- **Dispute Period**: Grace period for raising concerns after verification
- **Emergency Fund Release**: Safety mechanism for stuck funds
- **Developer Profiles**: Track reputation, earnings, and completion history

### Dispute Resolution
- **Dispute Creation**: Allow stakeholders to raise concerns about completed work
- **Administrative Resolution**: Contract owner can resolve disputes fairly
- **Flexible Outcomes**: Support for developer awards or creator refunds

## 📋 Contract Structure

### Bounty Lifecycle States
1. **Active** (`status-active`): Open for submissions
2. **Submitted** (`status-submitted`): Work submitted, awaiting verification
3. **Verified** (`status-verified`): Work approved, in dispute period
4. **Completed** (`status-completed`): Payment released successfully
5. **Disputed** (`status-disputed`): Under dispute review
6. **Cancelled** (`status-cancelled`): Bounty cancelled, funds refunded

### Priority Levels
- **Low** (`priority-low`): Nice-to-have features
- **Medium** (`priority-medium`): Standard improvements
- **High** (`priority-high`): Important fixes
- **Critical** (`priority-critical`): Urgent security or blocking issues

### Difficulty Levels
- **Beginner** (`difficulty-beginner`): Simple tasks, minimal experience required
- **Intermediate** (`difficulty-intermediate`): Moderate complexity
- **Advanced** (`difficulty-advanced`): Complex tasks requiring expertise
- **Expert** (`difficulty-expert`): Highly specialized or architectural work

## 🔧 Usage Examples

### Creating a Bounty

```clarity
(contract-call? .bounty-contract create-bounty
  "Fix authentication bug"                    ;; title
  "Login system not working properly"         ;; description
  "Must include unit tests and docs"          ;; requirements
  (some "https://github.com/project/repo")    ;; repository URL
  u5000000                                    ;; amount (5 STX)
  u1440                                       ;; deadline (10 days)
  u3                                          ;; priority (high)
  u2                                          ;; difficulty (intermediate)
  (list "javascript" "authentication")       ;; tags
  none                                        ;; verifier (optional)
)
```

### Submitting Work

```clarity
(contract-call? .bounty-contract submit-work
  u1                                          ;; bounty ID
  "https://github.com/dev/solution"          ;; submission URL
  "Fixed the auth bug with comprehensive tests" ;; description
)
```

### Verifying Submission

```clarity
(contract-call? .bounty-contract verify-submission
  u1                                          ;; bounty ID
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4     ;; developer principal
  true                                        ;; approved
  (some "Excellent work, all requirements met") ;; notes
)
```

### Releasing Payment

```clarity
(contract-call? .bounty-contract release-payment
  u1                                          ;; bounty ID
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4     ;; developer principal
)
```

## 🛡️ Security Features

### Fund Protection
- **Escrow Lock**: Funds locked in contract until work completion
- **Verification Required**: Payments only after approval
- **Dispute Period**: Time buffer for raising concerns
- **Emergency Release**: Admin override for stuck funds

### Access Control
- **Owner-Only Functions**: Administrative functions restricted to contract owner
- **Creator Permissions**: Bounty management limited to creators
- **Assignment Enforcement**: Submission restrictions for assigned bounties
- **Verifier Registry**: Controlled list of trusted reviewers

### Validation & Constraints
- **Minimum Amounts**: Configurable minimum bounty amounts
- **Deadline Validation**: Automatic expiration handling
- **Input Sanitization**: Parameter validation and error handling
- **Status Consistency**: State machine enforcement

## 📊 Data Structures

### Bounty Record
```clarity
{
  id: uint,
  creator: principal,
  title: string-ascii,
  description: string-utf8,
  requirements: string-utf8,
  repository-url: optional string-ascii,
  amount: uint,
  deadline: uint,
  priority: uint,
  difficulty: uint,
  tags: list of string-ascii,
  status: uint,
  created-at: uint,
  verification-deadline: optional uint,
  assigned-to: optional principal,
  verifier: optional principal
}
```

### Submission Record
```clarity
{
  id: uint,
  bounty-id: uint,
  developer: principal,
  submission-url: string-ascii,
  description: string-utf8,
  submitted-at: uint,
  verified: bool,
  verification-notes: optional string-utf8,
  verified-at: optional uint,
  verified-by: optional principal
}
```

### Developer Profile
```clarity
{
  reputation-score: uint,
  completed-bounties: uint,
  total-earned: uint,
  specialties: list of string-ascii,
  github-username: optional string-ascii,
  contact-info: optional string-ascii,
  joined-at: uint,
  is-verified: bool
}
```

## 🔍 Read-Only Functions

### Query Bounties
- `get-bounty(bounty-id)`: Get complete bounty details
- `is-bounty-active(bounty-id)`: Check if bounty accepts submissions
- `can-submit-work(bounty-id, developer)`: Validate submission eligibility

### Query Submissions
- `get-submission(submission-id)`: Get submission details
- `get-bounty-submission(bounty-id, developer)`: Get submission for specific bounty

### Query Profiles & Stats
- `get-developer-profile(developer)`: Get developer statistics
- `get-contract-stats()`: Get platform-wide statistics
- `get-escrow-info(bounty-id)`: Get escrow status

## ⚙️ Configuration

### Platform Settings
- **Platform Fee Rate**: Default 2.5% (250 basis points)
- **Dispute Period**: 7 days (1008 blocks)
- **Verification Timeout**: 30 days (4320 blocks)
- **Minimum Bounty**: 1 STX (1,000,000 micro-STX)

### Administrative Functions
- `set-platform-fee-rate(new-rate)`: Update platform fees
- `set-dispute-period(new-period)`: Modify dispute window
- `set-min-bounty-amount(new-amount)`: Change minimum bounty
- `add-verifier(verifier, domains)`: Add trusted verifiers

## 🧪 Testing

The contract includes comprehensive tests using Vitest, covering:

- **Bounty Lifecycle**: Creation, submission, verification, payment
- **Access Control**: Authorization and permission validation
- **Edge Cases**: Expired bounties, duplicate submissions, disputes
- **Economic Logic**: Fee calculations, escrow management
- **Error Handling**: Invalid inputs, unauthorized access

### Running Tests

```bash
npm install vitest
npm test
```

## 🚨 Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| 100 | `err-owner-only` | Function restricted to contract owner |
| 101 | `err-not-found` | Requested resource doesn't exist |
| 102 | `err-unauthorized` | Insufficient permissions |
| 103 | `err-invalid-input` | Invalid parameter values |
| 104 | `err-insufficient-funds` | Not enough STX for operation |
| 105 | `err-bounty-not-active` | Bounty not accepting changes |
| 106 | `err-bounty-expired` | Past submission deadline |
| 107 | `err-already-submitted` | Developer already submitted |
| 108 | `err-not-submitted` | No submission found |
| 109 | `err-verification-pending` | Waiting for verification |
| 110 | `err-already-verified` | Already processed |
| 111 | `err-invalid-status` | Wrong bounty state |
| 112 | `err-dispute-period-active` | Cannot release during disputes |

## 🤝 Contributing

This contract is designed to be deployed on the Stacks blockchain. To contribute:

1. Review the contract logic and test coverage
2. Submit issues for bugs or feature requests
3. Propose improvements through pull requests
4. Test thoroughly on Stacks testnet before mainnet deployment

## 📄 License

This smart contract is provided as-is for educational and development purposes. Review and audit thoroughly before production use.

## 🔗 Links

- [Stacks Documentation](https://docs.stacks.co/)
- [Clarity Language Reference](https://docs.stacks.co/clarity/)
- [Stacks Testnet](https://explorer.stacks.co/?chain=testnet)

------------

Built with ❤️ for the Stacks ecosystem