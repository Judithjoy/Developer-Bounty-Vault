;; Code Bounty Escrow
;; A smart contract for managing code bounties with escrow functionality and verification system

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-invalid-input (err u103))
(define-constant err-insufficient-funds (err u104))
(define-constant err-bounty-not-active (err u105))
(define-constant err-bounty-expired (err u106))
(define-constant err-already-submitted (err u107))
(define-constant err-not-submitted (err u108))
(define-constant err-verification-pending (err u109))
(define-constant err-already-verified (err u110))
(define-constant err-invalid-status (err u111))
(define-constant err-dispute-period-active (err u112))

;; Bounty Status Constants
(define-constant status-active u1)
(define-constant status-submitted u2)
(define-constant status-verified u3)
(define-constant status-completed u4)
(define-constant status-disputed u5)
(define-constant status-cancelled u6)

;; Priority Levels
(define-constant priority-low u1)
(define-constant priority-medium u2)
(define-constant priority-high u3)
(define-constant priority-critical u4)

;; Difficulty Levels
(define-constant difficulty-beginner u1)
(define-constant difficulty-intermediate u2)
(define-constant difficulty-advanced u3)
(define-constant difficulty-expert u4)

;; Data Variables
(define-data-var next-bounty-id uint u1)
(define-data-var next-submission-id uint u1)
(define-data-var platform-fee-rate uint u250) ;; 2.5% in basis points
(define-data-var dispute-period-blocks uint u1008) ;; ~7 days
(define-data-var verification-timeout-blocks uint u4320) ;; ~30 days
(define-data-var min-bounty-amount uint u1000000) ;; 1 STX minimum
(define-data-var platform-treasury principal contract-owner)

;; Bounty Data Structure
(define-map bounties
    uint
    {
        id: uint,
        creator: principal,
        title: (string-ascii 200),
        description: (string-utf8 1000),
        requirements: (string-utf8 1000),
        repository-url: (optional (string-ascii 500)),
        amount: uint,
        deadline: uint,
        priority: uint,
        difficulty: uint,
        tags: (list 10 (string-ascii 50)),
        status: uint,
        created-at: uint,
        verification-deadline: (optional uint),
        assigned-to: (optional principal),
        verifier: (optional principal)
    }
)

;; Submission Data Structure
(define-map submissions
    uint
    {
        id: uint,
        bounty-id: uint,
        developer: principal,
        submission-url: (string-ascii 500),
        description: (string-utf8 500),
        submitted-at: uint,
        verified: bool,
        verification-notes: (optional (string-utf8 500)),
        verified-at: (optional uint),
        verified-by: (optional principal)
    }
)

;; Escrow Holdings - tracks escrowed funds for each bounty
(define-map escrow-holdings
    uint
    {
        amount: uint,
        locked: bool,
        released: bool
    }
)

;; Bounty-Submission Mapping - maps bounties to their submissions
(define-map bounty-submissions
    { bounty-id: uint, developer: principal }
    uint
)

;; Developer Profiles
(define-map developer-profiles
    principal
    {
        reputation-score: uint,
        completed-bounties: uint,
        total-earned: uint,
        specialties: (list 5 (string-ascii 50)),
        github-username: (optional (string-ascii 100)),
        contact-info: (optional (string-ascii 200)),
        joined-at: uint,
        is-verified: bool
    }
)

;; Dispute Management
(define-map disputes
    uint
    {
        bounty-id: uint,
        disputed-by: principal,
        reason: (string-utf8 500),
        created-at: uint,
        resolved: bool,
        resolution: (optional (string-utf8 500)),
        resolved-by: (optional principal),
        resolved-at: (optional uint)
    }
)

;; Verifier Registry - trusted verifiers for different domains
(define-map verifiers
    principal
    {
        domains: (list 10 (string-ascii 50)),
        reputation: uint,
        verified-count: uint,
        added-by: principal,
        added-at: uint,
        is-active: bool
    }
)

;; Quick lookups
(define-map bounty-creator-lookup { bounty-id: uint } principal)
(define-map user-bounties { creator: principal, bounty-id: uint } bool)
(define-map developer-submissions { developer: principal, bounty-id: uint } bool)

;; Authorization Functions
(define-private (is-contract-owner)
    (is-eq tx-sender contract-owner)
)

(define-private (is-bounty-creator (bounty-id uint))
    (match (map-get? bounty-creator-lookup { bounty-id: bounty-id })
        creator (is-eq tx-sender creator)
        false
    )
)

(define-private (is-authorized-verifier (bounty-id uint))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) false))
        )
        (match (get verifier bounty)
            verifier (is-eq tx-sender verifier)
            (is-bounty-creator bounty-id)
        )
    )
)

(define-private (calculate-platform-fee (amount uint))
    (/ (* amount (var-get platform-fee-rate)) u10000)
)

;; Bounty Management Functions
(define-public (create-bounty
    (title (string-ascii 200))
    (description (string-utf8 1000))
    (requirements (string-utf8 1000))
    (repository-url (optional (string-ascii 500)))
    (amount uint)
    (deadline-blocks uint)
    (priority uint)
    (difficulty uint)
    (tags (list 10 (string-ascii 50)))
    (verifier (optional principal)))
    (let
        (
            (bounty-id (var-get next-bounty-id))
            (deadline (+ stacks-block-height deadline-blocks))
        )
        (asserts! (>= amount (var-get min-bounty-amount)) err-insufficient-funds)
        (asserts! (> deadline-blocks u0) err-invalid-input)
        (asserts! (and (>= priority priority-low) (<= priority priority-critical)) err-invalid-input)
        (asserts! (and (>= difficulty difficulty-beginner) (<= difficulty difficulty-expert)) err-invalid-input)
        (asserts! (> (len title) u0) err-invalid-input)
        
        ;; Verify verifier if provided
        (match verifier
            v (asserts! (default-to false (get is-active (map-get? verifiers v))) err-not-found)
            true
        )
        
        ;; Transfer funds to escrow
        (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
        
        ;; Create bounty record
        (map-set bounties bounty-id {
            id: bounty-id,
            creator: tx-sender,
            title: title,
            description: description,
            requirements: requirements,
            repository-url: repository-url,
            amount: amount,
            deadline: deadline,
            priority: priority,
            difficulty: difficulty,
            tags: tags,
            status: status-active,
            created-at: stacks-block-height,
            verification-deadline: none,
            assigned-to: none,
            verifier: verifier
        })
        
        ;; Set up escrow
        (map-set escrow-holdings bounty-id {
            amount: amount,
            locked: true,
            released: false
        })
        
        ;; Update lookups
        (map-set bounty-creator-lookup { bounty-id: bounty-id } tx-sender)
        (map-set user-bounties { creator: tx-sender, bounty-id: bounty-id } true)
        
        (var-set next-bounty-id (+ bounty-id u1))
        
        (print {
            event: "bounty-created",
            bounty-id: bounty-id,
            creator: tx-sender,
            amount: amount,
            deadline: deadline
        })
        
        (ok bounty-id)
    )
)

(define-public (update-bounty-details
    (bounty-id uint)
    (title (string-ascii 200))
    (description (string-utf8 1000))
    (requirements (string-utf8 1000))
    (repository-url (optional (string-ascii 500))))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) err-not-found))
        )
        (asserts! (is-bounty-creator bounty-id) err-unauthorized)
        (asserts! (is-eq (get status bounty) status-active) err-bounty-not-active)
        
        (map-set bounties bounty-id (merge bounty {
            title: title,
            description: description,
            requirements: requirements,
            repository-url: repository-url
        }))
        
        (ok true)
    )
)

(define-public (assign-bounty (bounty-id uint) (developer principal))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) err-not-found))
        )
        (asserts! (is-bounty-creator bounty-id) err-unauthorized)
        (asserts! (is-eq (get status bounty) status-active) err-bounty-not-active)
        
        (map-set bounties bounty-id (merge bounty {
            assigned-to: (some developer)
        }))
        
        (print {
            event: "bounty-assigned",
            bounty-id: bounty-id,
            developer: developer
        })
        
        (ok true)
    )
)

(define-public (cancel-bounty (bounty-id uint))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) err-not-found))
            (escrow (unwrap! (map-get? escrow-holdings bounty-id) err-not-found))
        )
        (asserts! (is-bounty-creator bounty-id) err-unauthorized)
        (asserts! (is-eq (get status bounty) status-active) err-bounty-not-active)
        
        ;; Return funds to creator
        (try! (as-contract (stx-transfer? (get amount escrow) tx-sender (get creator bounty))))
        
        ;; Update bounty status
        (map-set bounties bounty-id (merge bounty { status: status-cancelled }))
        
        ;; Update escrow
        (map-set escrow-holdings bounty-id (merge escrow { 
            locked: false,
            released: true
        }))
        
        (print {
            event: "bounty-cancelled",
            bounty-id: bounty-id,
            refunded-amount: (get amount escrow)
        })
        
        (ok true)
    )
)

;; Submission Management Functions
(define-public (submit-work
    (bounty-id uint)
    (submission-url (string-ascii 500))
    (description (string-utf8 500)))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) err-not-found))
            (submission-id (var-get next-submission-id))
        )
        (asserts! (is-eq (get status bounty) status-active) err-bounty-not-active)
        (asserts! (< stacks-block-height (get deadline bounty)) err-bounty-expired)
        (asserts! (is-none (map-get? bounty-submissions { bounty-id: bounty-id, developer: tx-sender })) err-already-submitted)
        (asserts! (> (len submission-url) u0) err-invalid-input)
        
        ;; Check if bounty is assigned and if so, verify assignment
        (match (get assigned-to bounty)
            assigned (asserts! (is-eq tx-sender assigned) err-unauthorized)
            true
        )
        
        ;; Create submission record
        (map-set submissions submission-id {
            id: submission-id,
            bounty-id: bounty-id,
            developer: tx-sender,
            submission-url: submission-url,
            description: description,
            submitted-at: stacks-block-height,
            verified: false,
            verification-notes: none,
            verified-at: none,
            verified-by: none
        })
        
        ;; Update bounty status and set verification deadline
        (let
            (
                (verification-deadline (+ stacks-block-height (var-get verification-timeout-blocks)))
            )
            (map-set bounties bounty-id (merge bounty {
                status: status-submitted,
                verification-deadline: (some verification-deadline)
            }))
        )
        
        ;; Update mappings
        (map-set bounty-submissions { bounty-id: bounty-id, developer: tx-sender } submission-id)
        (map-set developer-submissions { developer: tx-sender, bounty-id: bounty-id } true)
        
        (var-set next-submission-id (+ submission-id u1))
        
        (print {
            event: "work-submitted",
            bounty-id: bounty-id,
            submission-id: submission-id,
            developer: tx-sender
        })
        
        (ok submission-id)
    )
)

(define-public (verify-submission
    (bounty-id uint)
    (developer principal)
    (approved bool)
    (notes (optional (string-utf8 500))))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) err-not-found))
            (submission-id (unwrap! (map-get? bounty-submissions { bounty-id: bounty-id, developer: developer }) err-not-submitted))
            (submission (unwrap! (map-get? submissions submission-id) err-not-found))
        )
        (asserts! (is-authorized-verifier bounty-id) err-unauthorized)
        (asserts! (is-eq (get status bounty) status-submitted) err-invalid-status)
        (asserts! (not (get verified submission)) err-already-verified)
        
        ;; Update submission
        (map-set submissions submission-id (merge submission {
            verified: approved,
            verification-notes: notes,
            verified-at: (some stacks-block-height),
            verified-by: (some tx-sender)
        }))
        
        ;; Update bounty status
        (map-set bounties bounty-id (merge bounty {
            status: (if approved status-verified status-active)
        }))
        
        (print {
            event: "submission-verified",
            bounty-id: bounty-id,
            developer: developer,
            approved: approved,
            verifier: tx-sender
        })
        
        ;; If approved, start dispute period
        (if approved
            (ok true)
            (ok false)
        )
    )
)

(define-public (release-payment (bounty-id uint) (developer principal))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) err-not-found))
            (escrow (unwrap! (map-get? escrow-holdings bounty-id) err-not-found))
            (submission-id (unwrap! (map-get? bounty-submissions { bounty-id: bounty-id, developer: developer }) err-not-submitted))
            (submission (unwrap! (map-get? submissions submission-id) err-not-found))
        )
        (asserts! (is-eq (get status bounty) status-verified) err-invalid-status)
        (asserts! (get verified submission) err-not-found)
        (asserts! (not (get released escrow)) err-already-verified)
        
        ;; Check if dispute period has passed
        (match (get verified-at submission)
            verified-time (asserts! (> stacks-block-height (+ verified-time (var-get dispute-period-blocks))) err-dispute-period-active)
            (asserts! false err-not-found)
        )
        
        (let
            (
                (bounty-amount (get amount escrow))
                (platform-fee (calculate-platform-fee bounty-amount))
                (developer-payment (- bounty-amount platform-fee))
            )
            ;; Transfer payment to developer
            (try! (as-contract (stx-transfer? developer-payment tx-sender developer)))
            
            ;; Transfer platform fee
            (try! (as-contract (stx-transfer? platform-fee tx-sender (var-get platform-treasury))))
            
            ;; Update records
            (map-set bounties bounty-id (merge bounty { status: status-completed }))
            (map-set escrow-holdings bounty-id (merge escrow { 
                locked: false,
                released: true
            }))
            
            ;; Update developer profile
            (let
                (
                    (profile (default-to 
                        {
                            reputation-score: u0,
                            completed-bounties: u0,
                            total-earned: u0,
                            specialties: (list),
                            github-username: none,
                            contact-info: none,
                            joined-at: stacks-block-height,
                            is-verified: false
                        }
                        (map-get? developer-profiles developer)
                    ))
                )
                (map-set developer-profiles developer (merge profile {
                    completed-bounties: (+ (get completed-bounties profile) u1),
                    total-earned: (+ (get total-earned profile) developer-payment),
                    reputation-score: (+ (get reputation-score profile) u10)
                }))
            )
            
            (print {
                event: "payment-released",
                bounty-id: bounty-id,
                developer: developer,
                amount: developer-payment,
                platform-fee: platform-fee
            })
            
            (ok developer-payment)
        )
    )
)

;; Dispute Management
(define-public (create-dispute
    (bounty-id uint)
    (reason (string-utf8 500)))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) err-not-found))
        )
        (asserts! (or (is-bounty-creator bounty-id) (is-eq tx-sender (unwrap! (get assigned-to bounty) err-unauthorized))) err-unauthorized)
        (asserts! (is-eq (get status bounty) status-verified) err-invalid-status)
        
        (map-set disputes bounty-id {
            bounty-id: bounty-id,
            disputed-by: tx-sender,
            reason: reason,
            created-at: stacks-block-height,
            resolved: false,
            resolution: none,
            resolved-by: none,
            resolved-at: none
        })
        
        (map-set bounties bounty-id (merge bounty { status: status-disputed }))
        
        (print {
            event: "dispute-created",
            bounty-id: bounty-id,
            disputed-by: tx-sender
        })
        
        (ok true)
    )
)

(define-public (resolve-dispute
    (bounty-id uint)
    (resolution (string-utf8 500))
    (award-to-developer bool))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) err-not-found))
            (dispute (unwrap! (map-get? disputes bounty-id) err-not-found))
            (escrow (unwrap! (map-get? escrow-holdings bounty-id) err-not-found))
        )
        (asserts! (is-contract-owner) err-owner-only)
        (asserts! (not (get resolved dispute)) err-already-verified)
        
        ;; Update dispute
        (map-set disputes bounty-id (merge dispute {
            resolved: true,
            resolution: (some resolution),
            resolved-by: (some tx-sender),
            resolved-at: (some stacks-block-height)
        }))
        
        ;; Handle payment based on resolution
        (if award-to-developer
            (begin
                (map-set bounties bounty-id (merge bounty { status: status-verified }))
                (ok true)
            )
            (begin
                ;; Refund to bounty creator
                (try! (as-contract (stx-transfer? (get amount escrow) tx-sender (get creator bounty))))
                (map-set bounties bounty-id (merge bounty { status: status-cancelled }))
                (map-set escrow-holdings bounty-id (merge escrow { 
                    locked: false,
                    released: true
                }))
                (ok false)
            )
        )
    )
)

;; Verifier Management
(define-public (add-verifier
    (verifier-principal principal)
    (domains (list 10 (string-ascii 50))))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (asserts! (is-none (map-get? verifiers verifier-principal)) err-already-verified)
        
        (map-set verifiers verifier-principal {
            domains: domains,
            reputation: u0,
            verified-count: u0,
            added-by: tx-sender,
            added-at: stacks-block-height,
            is-active: true
        })
        
        (ok true)
    )
)

;; Developer Profile Management
(define-public (create-developer-profile
    (specialties (list 5 (string-ascii 50)))
    (github-username (optional (string-ascii 100)))
    (contact-info (optional (string-ascii 200))))
    (begin
        (asserts! (is-none (map-get? developer-profiles tx-sender)) err-already-verified)
        
        (map-set developer-profiles tx-sender {
            reputation-score: u0,
            completed-bounties: u0,
            total-earned: u0,
            specialties: specialties,
            github-username: github-username,
            contact-info: contact-info,
            joined-at: stacks-block-height,
            is-verified: false
        })
        
        (ok true)
    )
)

;; Emergency Functions
(define-public (emergency-release-funds (bounty-id uint))
    (let
        (
            (bounty (unwrap! (map-get? bounties bounty-id) err-not-found))
            (escrow (unwrap! (map-get? escrow-holdings bounty-id) err-not-found))
        )
        (asserts! (is-contract-owner) err-owner-only)
        (asserts! (not (get released escrow)) err-already-verified)
        
        ;; Check if verification deadline has passed
        (match (get verification-deadline bounty)
            deadline (asserts! (> stacks-block-height deadline) err-verification-pending)
            (asserts! false err-not-found)
        )
        
        ;; Refund to creator
        (try! (as-contract (stx-transfer? (get amount escrow) tx-sender (get creator bounty))))
        
        (map-set bounties bounty-id (merge bounty { status: status-cancelled }))
        (map-set escrow-holdings bounty-id (merge escrow { 
            locked: false,
            released: true
        }))
        
        (ok true)
    )
)

;; Read-only Functions
(define-read-only (get-bounty (bounty-id uint))
    (map-get? bounties bounty-id)
)

(define-read-only (get-submission (submission-id uint))
    (map-get? submissions submission-id)
)

(define-read-only (get-bounty-submission (bounty-id uint) (developer principal))
    (match (map-get? bounty-submissions { bounty-id: bounty-id, developer: developer })
        submission-id (map-get? submissions submission-id)
        none
    )
)

(define-read-only (get-escrow-info (bounty-id uint))
    (map-get? escrow-holdings bounty-id)
)

(define-read-only (get-developer-profile (developer principal))
    (map-get? developer-profiles developer)
)

(define-read-only (get-dispute (bounty-id uint))
    (map-get? disputes bounty-id)
)

(define-read-only (get-verifier (verifier-principal principal))
    (map-get? verifiers verifier-principal)
)

(define-read-only (is-bounty-active (bounty-id uint))
    (match (map-get? bounties bounty-id)
        bounty (and 
            (is-eq (get status bounty) status-active)
            (< stacks-block-height (get deadline bounty))
        )
        false
    )
)

(define-read-only (can-submit-work (bounty-id uint) (developer principal))
    (let
        (
            (bounty (map-get? bounties bounty-id))
        )
        (match bounty
            b (and
                (is-eq (get status b) status-active)
                (< stacks-block-height (get deadline b))
                (is-none (map-get? bounty-submissions { bounty-id: bounty-id, developer: developer }))
                (match (get assigned-to b)
                    assigned (is-eq developer assigned)
                    true
                )
            )
            false
        )
    )
)

(define-read-only (get-contract-stats)
    {
        total-bounties: (- (var-get next-bounty-id) u1),
        total-submissions: (- (var-get next-submission-id) u1),
        platform-fee-rate: (var-get platform-fee-rate),
        dispute-period-blocks: (var-get dispute-period-blocks),
        verification-timeout-blocks: (var-get verification-timeout-blocks),
        min-bounty-amount: (var-get min-bounty-amount)
    }
)

;; Administrative Functions
(define-public (set-platform-fee-rate (new-rate uint))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (asserts! (<= new-rate u1000) err-invalid-input) ;; Max 10%
        (var-set platform-fee-rate new-rate)
        (ok true)
    )
)

(define-public (set-dispute-period (new-period uint))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (var-set dispute-period-blocks new-period)
        (ok true)
    )
)

(define-public (set-min-bounty-amount (new-amount uint))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (var-set min-bounty-amount new-amount)
        (ok true)
    )
)

(define-public (set-platform-treasury (new-treasury principal))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (var-set platform-treasury new-treasury)
        (ok true)
    )
)