import { useEffect, useState } from 'react'
import './App.css'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const saveLoanEndpoint = 'https://6a4f9fa1f45d5352b611aca2.mockapi.io/api/Loan'
const localStorageKey = 'loan-calculation-sheets'

const createLoanSheet = (id) => ({
  id,
  lender: 'My loan',
  amount: '',
  rate: 9,
  years: 1,
  months: 0,
  startDate: '2026-10-01',
  extraPayments: {},
  paidPayments: {},
  loanClosed: false,
})

const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0)

const formatDate = (date) => {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
}

const addMonths = (dateString, monthsToAdd) => {
  const date = new Date(`${dateString}T00:00:00`)
  date.setMonth(date.getMonth() + monthsToAdd)
  return formatDate(date)
}

const calculateLoanProgress = (loan) => {
  const principal = loan.amount === '' ? 0 : Number(loan.amount || 0)
  const annualRate = loan.rate === '' ? 0 : Number(loan.rate || 0)
  const years = loan.years === '' ? 0 : Number(loan.years || 0)
  const months = loan.months === '' ? 0 : Number(loan.months || 0)
  const paymentCount = Math.max(1, Math.round((years + months / 12) * 12))
  const periodicRate = annualRate / 100 / 12
  const scheduledPayment = periodicRate === 0
    ? principal / paymentCount
    : (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -paymentCount))

  return Array.from({ length: paymentCount }).reduce((progress, _, index) => {
    const paymentNumber = index + 1
    const interest = progress.scheduleBalance * periodicRate
    const extraPayment = Number(loan.extraPayments?.[paymentNumber] || 0)
    const regularPayment = paymentNumber === paymentCount ? progress.scheduleBalance + interest : scheduledPayment
    const totalPayment = Math.min(progress.scheduleBalance + interest, regularPayment + extraPayment)
    const principalPaid = Math.max(0, totalPayment - interest)
    const isPaid = Boolean(loan.paidPayments?.[paymentNumber])
    const endingBalance = Math.max(0, progress.scheduleBalance - principalPaid)

    return {
      balance: isPaid ? endingBalance : progress.balance,
      scheduleBalance: endingBalance,
      paidAmount: progress.paidAmount + (isPaid ? totalPayment : 0),
      paidPrincipal: progress.paidPrincipal + (isPaid ? principalPaid : 0),
    }
  }, { balance: principal, scheduleBalance: principal, paidAmount: 0, paidPrincipal: 0 })
}

function App() {
  const [loanSheets, setLoanSheets] = useState(() => {
    try {
      const storedLoans = localStorage.getItem(localStorageKey)
      return storedLoans ? JSON.parse(storedLoans) : [createLoanSheet(1)]
    } catch {
      return [createLoanSheet(1)]
    }
  })
  const [activeLoanId, setActiveLoanId] = useState(() => {
    try {
      const storedLoans = localStorage.getItem(localStorageKey)
      return storedLoans ? JSON.parse(storedLoans)[0]?.id || 1 : 1
    } catch {
      return 1
    }
  })
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' })

  useEffect(() => {
    localStorage.setItem(localStorageKey, JSON.stringify(loanSheets))
  }, [loanSheets])

  const updateLoan = (id, field, value) => {
    setLoanSheets((prev) => prev.map((sheet) => {
      if (sheet.id !== id) return sheet

      if (['amount', 'rate', 'years', 'months'].includes(field)) {
        return { ...sheet, [field]: value === '' ? '' : Number(value) }
      }

      return { ...sheet, [field]: value }
    }))
  }

  const updateExtraPayment = (id, paymentNumber, value) => {
    setLoanSheets((prev) => prev.map((sheet) => {
      if (sheet.id !== id) return sheet

      return {
        ...sheet,
        extraPayments: {
          ...(sheet.extraPayments || {}),
          [paymentNumber]: value === '' ? '' : Number(value),
        },
      }
    }))
  }

  const updatePaymentPaid = (id, paymentNumber, isPaid) => {
    setLoanSheets((prev) => prev.map((sheet) => {
      if (sheet.id !== id) return sheet

      return {
        ...sheet,
        paidPayments: {
          ...(sheet.paidPayments || {}),
          [paymentNumber]: isPaid,
        },
      }
    }))
  }

  const updateLoanClosed = (id, isClosed) => {
    setLoanSheets((prev) => prev.map((sheet) => (
      sheet.id === id ? { ...sheet, loanClosed: isClosed } : sheet
    )))
  }

  const activeLoan = loanSheets.find((sheet) => sheet.id === activeLoanId) || loanSheets[0]

  const addLoanSheet = () => {
    const newLoan = createLoanSheet(Date.now())
    setLoanSheets((prev) => [...prev, newLoan])
    setActiveLoanId(newLoan.id)
    setSaveState({ status: 'idle', message: '' })
  }

  const deleteActiveLoan = () => {
    if (loanSheets.length === 1 || !window.confirm(`Delete ${activeLoan.lender || 'this loan'}?`)) return

    const remainingLoans = loanSheets.filter((sheet) => sheet.id !== activeLoan.id)
    setLoanSheets(remainingLoans)
    setActiveLoanId(remainingLoans[0].id)
    setSaveState({ status: 'idle', message: '' })
  }

  const handleSave = async () => {
    setSaveState({ status: 'saving', message: 'Saving loan...' })

    const payload = {
      lender: activeLoan.lender,
      loanAmount: activeLoan.amount === '' ? 0 : Number(activeLoan.amount),
      annualInterestRate: activeLoan.rate === '' ? 0 : Number(activeLoan.rate),
      loanPeriodYears: activeLoan.years === '' ? 0 : Number(activeLoan.years),
      loanPeriodMonths: activeLoan.months === '' ? 0 : Number(activeLoan.months),
      startDate: activeLoan.startDate,
      scheduledPayment: calculation.scheduledPayment,
      totalInterest: calculation.totalInterest,
      amortizationSchedule: calculation.rows,
      paidPayments: activeLoan.paidPayments || {},
      loanClosed: Boolean(activeLoan.loanClosed),
    }

    try {
      const response = await fetch(saveLoanEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      setSaveState({ status: 'success', message: 'Loan saved successfully.' })
    } catch {
      setSaveState({ status: 'error', message: 'Unable to save loan. Please try again.' })
    }
  }

  const calculation = (() => {
    const principal = activeLoan.amount === '' ? 0 : Number(activeLoan.amount || 0)
    const annualRate = activeLoan.rate === '' ? 0 : Number(activeLoan.rate || 0)
    const years = activeLoan.years === '' ? 0 : Number(activeLoan.years || 0)
    const months = activeLoan.months === '' ? 0 : Number(activeLoan.months || 0)
    const totalYears = years + months / 12
    const paymentCount = Math.max(1, Math.round(totalYears * 12))
    const periodicRate = annualRate / 100 / 12

    const scheduledPayment = periodicRate === 0
      ? principal / paymentCount
      : (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -paymentCount))

    const result = Array.from({ length: paymentCount }).reduce((accumulator, _, index) => {
      const paymentNumber = index + 1
      const paymentDate = addMonths(activeLoan.startDate, index)
      const beginningBalance = accumulator.balance
      const interest = beginningBalance * periodicRate
      const extraPayment = Number(activeLoan.extraPayments?.[paymentNumber] || 0)
      const regularPayment = paymentNumber === paymentCount ? beginningBalance + interest : scheduledPayment
      const totalPayment = Math.min(beginningBalance + interest, regularPayment + extraPayment)
      const principalPaid = Math.max(0, totalPayment - interest)
      const endingBalance = Math.max(0, beginningBalance - principalPaid)
      const cumulativeInterest = accumulator.cumulativeInterest + interest

      const row = {
        paymentNumber,
        date: paymentDate,
        beginningBalance: formatCurrency(beginningBalance),
        scheduledPayment: formatCurrency(scheduledPayment),
        extraPayment: formatCurrency(Math.max(0, totalPayment - regularPayment)),
        totalPayment: formatCurrency(totalPayment),
        principal: formatCurrency(principalPaid),
        interest: formatCurrency(interest),
        endingBalance: formatCurrency(endingBalance),
        cumulativeInterest: formatCurrency(cumulativeInterest),
      }

      return {
        balance: endingBalance,
        cumulativeInterest,
        rows: [...accumulator.rows, row],
      }
    }, {
      balance: principal,
      cumulativeInterest: 0,
      rows: [],
    })

    const totalInterest = result.rows.reduce(
      (sum, row) => sum + Number(row.interest.replace(/[$,]/g, '')),
      0,
    )

    const paidRows = result.rows.filter((row) => activeLoan.paidPayments?.[row.paymentNumber])
    const paidAmount = paidRows.reduce(
      (sum, row) => sum + Number(row.totalPayment.replace(/[$,]/g, '')),
      0,
    )
    const paidPrincipal = paidRows.reduce(
      (sum, row) => sum + Number(row.principal.replace(/[$,]/g, '')),
      0,
    )

    return {
      scheduledPayment,
      totalInterest,
      paidCount: Object.values(activeLoan.paidPayments || {}).filter(Boolean).length,
      paidAmount,
      remainingBalance: Math.max(0, principal - paidPrincipal),
      rows: result.rows,
    }
  })()

  const overallCalculation = loanSheets.reduce((summary, loan) => {
    const progress = calculateLoanProgress(loan)
    const originalAmount = loan.amount === '' ? 0 : Number(loan.amount || 0)

    return {
      originalAmount: summary.originalAmount + originalAmount,
      paidAmount: summary.paidAmount + progress.paidAmount,
      remainingBalance: summary.remainingBalance + progress.balance,
    }
  }, { originalAmount: 0, paidAmount: 0, remainingBalance: 0 })

  return (
    <main className="loan-page">
      <header className="page-header">
        <div className="bank-mark" aria-label="Bank icon">
          <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
            <path d="M16 42 L60 14 L104 42" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
            <path d="M24 44 H96 V56 H24 Z" fill="none" stroke="currentColor" strokeWidth="5" />
            <path d="M20 52 H100 V92 H20 Z" fill="none" stroke="currentColor" strokeWidth="5" />
            <path d="M28 58 V86 M40 58 V86 M52 58 V86 M64 58 V86 M76 58 V86 M88 58 V86" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <path d="M52 18 V12 M68 18 V12" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          </svg>
        </div>
        <h1>Loan schedule</h1>
      </header>

      <section className="overall-summary" aria-label="All loans summary">
        <div>
          <span>All loans</span>
          <strong>{loanSheets.length}</strong>
        </div>
        <div>
          <span>Total loan amount</span>
          <strong>{formatCurrency(overallCalculation.originalAmount)}</strong>
        </div>
        <div>
          <span>Total paid</span>
          <strong>{formatCurrency(overallCalculation.paidAmount)}</strong>
        </div>
        <div>
          <span>Total balance</span>
          <strong>{formatCurrency(overallCalculation.remainingBalance)}</strong>
        </div>
      </section>

      <div className="loan-selector">
        <label className="field-label" htmlFor="loanSelect">Select loan</label>
        <select
          id="loanSelect"
          value={activeLoan.id}
          onChange={(event) => {
            setActiveLoanId(Number(event.target.value))
            setSaveState({ status: 'idle', message: '' })
          }}
        >
          {loanSheets.map((sheet, index) => (
            <option key={sheet.id} value={sheet.id}>
              {sheet.lender || `Loan ${index + 1}`}
            </option>
          ))}
        </select>
        <button className="add-loan-btn" type="button" onClick={addLoanSheet}>
          + Add loan
        </button>
        <button
          className="delete-loan-btn"
          type="button"
          onClick={deleteActiveLoan}
          disabled={loanSheets.length === 1}
        >
          Delete loan
        </button>
      </div>

      <section className="top-grid">
        <div className="panel">
          <h2>Enter values</h2>
          <div className="value-list">
            <div className="value-row">
              <label className="field-label" htmlFor="amount">Loan amount</label>
              <input
                id="amount"
                className="field-input"
                name="amount"
                type="number"
                value={activeLoan.amount}
                onChange={(event) => updateLoan(activeLoan.id, 'amount', event.target.value)}
              />
            </div>

            <div className="value-row">
              <label className="field-label" htmlFor="rate">Annual interest rate</label>
              <div className="input-with-suffix">
                <input
                  id="rate"
                  className="field-input"
                  name="rate"
                  type="number"
                  step="0.01"
                  value={activeLoan.rate}
                  onChange={(event) => updateLoan(activeLoan.id, 'rate', event.target.value)}
                />
                <span className="suffix">%</span>
              </div>
            </div>

            <div className="value-row">
              <label className="field-label">Loan period</label>
              <div className="period-inputs">
                <div className="period-box">
                  <input
                    id="years"
                    className="field-input"
                    name="years"
                    type="number"
                    min="0"
                    value={activeLoan.years}
                    onChange={(event) => updateLoan(activeLoan.id, 'years', event.target.value)}
                  />
                  <span className="period-label">Years</span>
                </div>
                <div className="period-box">
                  <input
                    id="months"
                    className="field-input"
                    name="months"
                    type="number"
                    min="0"
                    max="11"
                    value={activeLoan.months}
                    onChange={(event) => updateLoan(activeLoan.id, 'months', event.target.value)}
                  />
                  <span className="period-label">Months</span>
                </div>
              </div>
            </div>

            <div className="value-row">
              <label className="field-label" htmlFor="startDate">Start date of loan</label>
              <input
                id="startDate"
                className="field-input date-input"
                name="startDate"
                type="date"
                value={activeLoan.startDate}
                onChange={(event) => updateLoan(activeLoan.id, 'startDate', event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Loan summary</h2>
          <div className="value-list">
            <div className="value-row">
              <span className="field-label">Scheduled payment</span>
              <span className="field-value">{formatCurrency(calculation.scheduledPayment)}</span>
            </div>
            <div className="value-row">
              <span className="field-label">Total interest</span>
              <span className="field-value">{formatCurrency(calculation.totalInterest)}</span>
            </div>
            <div className="value-row">
              <span className="field-label">Months paid</span>
              <span className="field-value">{calculation.paidCount}</span>
            </div>
            <div className="value-row">
              <span className="field-label">Total paid</span>
              <span className="field-value">{formatCurrency(calculation.paidAmount)}</span>
            </div>
            <div className="value-row">
              <span className="field-label">Remaining balance</span>
              <span className="field-value">{formatCurrency(calculation.remainingBalance)}</span>
            </div>
            <label className="loan-closed-row">
              <input
                type="checkbox"
                checked={Boolean(activeLoan.loanClosed)}
                onChange={(event) => updateLoanClosed(activeLoan.id, event.target.checked)}
              />
              Loan closed
            </label>
          </div>
        </div>
      </section>

      <div className="bottom-summary">
        <div className="mini-row">
          <span className="field-label strong-label">Lender name</span>
          <div className="lender-control">
            <input
              className="custom-lender-input"
              type="text"
              value={activeLoan.lender}
              onChange={(event) => updateLoan(activeLoan.id, 'lender', event.target.value)}
              placeholder="Enter lender name"
            />
          </div>
        </div>
        <div className="save-actions">
          <button
            className="save-loan-btn"
            type="button"
            onClick={handleSave}
            disabled={saveState.status === 'saving'}
          >
            {saveState.status === 'saving' ? 'Saving...' : 'Save loan'}
          </button>
          {saveState.message && (
            <span className={`save-message ${saveState.status}`} role="status">
              {saveState.message}
            </span>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Paid</th>
              <th>Payment<br />number</th>
              <th>Payment<br />date</th>
              <th>Beginning<br />balance</th>
              <th>Scheduled<br />payment</th>
              <th>Extra<br />payment</th>
              <th>Total<br />payment</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Ending<br />balance</th>
              <th>Cumulative<br />interest</th>
            </tr>
          </thead>
          <tbody>
            {calculation.rows.map((row) => (
              <tr key={row.paymentNumber} className={activeLoan.paidPayments?.[row.paymentNumber] ? 'payment-paid' : ''}>
                <td className="paid-cell">
                  <input
                    type="checkbox"
                    checked={Boolean(activeLoan.paidPayments?.[row.paymentNumber])}
                    onChange={(event) => updatePaymentPaid(activeLoan.id, row.paymentNumber, event.target.checked)}
                    aria-label={`Mark payment ${row.paymentNumber} as paid`}
                  />
                </td>
                <td>{row.paymentNumber}</td>
                <td>{row.date}</td>
                <td>{row.beginningBalance}</td>
                <td>{row.scheduledPayment}</td>
                <td>
                  <input
                    className="extra-payment-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeLoan.extraPayments?.[row.paymentNumber] ?? 0}
                    onChange={(event) => updateExtraPayment(activeLoan.id, row.paymentNumber, event.target.value)}
                    aria-label={`Extra payment for payment ${row.paymentNumber}`}
                  />
                </td>
                <td>{row.totalPayment}</td>
                <td>{row.principal}</td>
                <td>{row.interest}</td>
                <td>{row.endingBalance}</td>
                <td>{row.cumulativeInterest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}

export default App
