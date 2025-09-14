(define-constant ERR_NOT_REGISTERED u101)
(define-constant ERR_INVALID_DATA u102)
(define-constant ERR_NOT_AUTHORIZED u103)
(define-constant ERR_INVALID_WEIGHT u104)
(define-constant ERR_INVALID_SCORE u105)
(define-constant ERR_ALREADY_SCORED u106)
(define-constant ERR_NO_SUBMISSION u107)
(define-constant ERR_INVALID_TIMESTAMP u108)
(define-constant ERR_AUTHORITY_NOT_SET u109)
(define-constant ERR_INVALID_AUDITOR u110)

(define-data-var financial-weight uint u40)
(define-data-var operational-weight uint u30)
(define-data-var impact-weight uint u30)
(define-data-var max-score uint u100)
(define-data-var authority-contract (optional principal) none)
(define-data-var scoring-fee uint u500)

(define-map charity-scores principal { score: uint, last-updated: uint, submission-id: uint })
(define-map data-submissions principal { financial-data: uint, operational-data: uint, impact-data: uint, timestamp: uint })
(define-map auditors principal { verified: bool, reputation: uint })
(define-map score-history principal (list 50 { score: uint, timestamp: uint }))

(define-read-only (get-score (charity principal))
  (map-get? charity-scores charity)
)

(define-read-only (get-submission (charity principal))
  (map-get? data-submissions charity)
)

(define-read-only (get-score-history (charity principal))
  (map-get? score-history charity)
)

(define-read-only (get-auditor (auditor principal))
  (map-get? auditors auditor)
)

(define-read-only (get-weights)
  { financial: (var-get financial-weight), operational: (var-get operational-weight), impact: (var-get impact-weight) }
)

(define-private (validate-data (data uint))
  (if (and (> data u0) (<= data u100))
      (ok true)
      (err ERR_INVALID_DATA))
)

(define-private (validate-weights (financial uint) (operational uint) (impact uint))
  (if (and (is-eq (+ financial operational impact) u100) (> financial u0) (> operational u0) (> impact u0))
      (ok true)
      (err ERR_INVALID_WEIGHT))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR_INVALID_TIMESTAMP))
)

(define-private (validate-auditor (auditor principal))
  (match (map-get? auditors auditor)
    auditor-info (if (get verified auditor-info) (ok true) (err ERR_INVALID_AUDITOR))
    (err ERR_INVALID_AUDITOR))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR_NOT_AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-weights (new-financial uint) (new-operational uint) (new-impact uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (try! (validate-weights new-financial new-operational new-impact))
    (var-set financial-weight new-financial)
    (var-set operational-weight new-operational)
    (var-set impact-weight new-impact)
    (ok true)
  )
)

(define-public (set-scoring-fee (new-fee uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set scoring-fee new-fee)
    (ok true)
  )
)

(define-public (register-auditor (auditor principal))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (asserts! (is-none (map-get? auditors auditor)) (err ERR_INVALID_AUDITOR))
    (map-set auditors auditor { verified: true, reputation: u0 })
    (ok true)
  )
)

(define-public (submit-data (charity principal) (financial-data uint) (operational-data uint) (impact-data uint))
  (begin
    (asserts! (is-some (contract-call? .charity-registry get-charity-details charity)) (err ERR_NOT_REGISTERED))
    (try! (validate-data financial-data))
    (try! (validate-data operational-data))
    (try! (validate-data impact-data))
    (try! (validate-timestamp block-height))
    (map-set data-submissions charity 
      { financial-data: financial-data, operational-data: operational-data, impact-data: impact-data, timestamp: block-height })
    (ok true)
  )
)

(define-public (calculate-score (charity principal) (submission-id uint))
  (let ((submission (map-get? data-submissions charity))
        (authority (unwrap! (var-get authority-contract) (err ERR_AUTHORITY_NOT_SET))))
    (match submission
      data
        (begin
          (asserts! (is-eq tx-sender (get creator (unwrap! (contract-call? .charity-registry get-charity-details charity) (err ERR_NOT_REGISTERED)))) (err ERR_NOT_AUTHORIZED))
          (asserts! (is-none (map-get? charity-scores charity)) (err ERR_ALREADY_SCORED))
          (try! (stx-transfer? (var-get scoring-fee) tx-sender authority))
          (let ((score (+ (* (get financial-data data) (var-get financial-weight))
                          (* (get operational-data data) (var-get operational-weight))
                          (* (get impact-data data) (var-get impact-weight)))))
            (asserts! (<= score (var-get max-score)) (err ERR_INVALID_SCORE))
            (map-set charity-scores charity { score: score, last-updated: block-height, submission-id: submission-id })
            (map-set score-history charity 
              (cons { score: score, timestamp: block-height } 
                    (default-to (list) (map-get? score-history charity))))
            (ok score)
          )
        )
      (err ERR_NO_SUBMISSION)
    )
  )
)

(define-public (verify-submission (charity principal) (submission-id uint))
  (let ((submission (map-get? data-submissions charity)))
    (match submission
      data
        (begin
          (try! (validate-auditor tx-sender))
          (map-set auditors tx-sender 
            { verified: true, reputation: (+ (get reputation (unwrap-panic (map-get? auditors tx-sender))) u10) })
          (ok true)
        )
      (err ERR_NO_SUBMISSION)
    )
  )
)