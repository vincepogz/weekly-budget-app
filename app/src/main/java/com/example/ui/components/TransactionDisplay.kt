package com.example.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.SyncAlt
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.example.data.model.AccountEntity
import com.example.data.model.TransactionEntity
import com.example.data.model.TransactionType
import com.example.ui.theme.ExpenseRed
import com.example.ui.theme.IncomeGreen
import com.example.ui.theme.TransferBlue

/** One place that decides how each transaction type looks, so every screen agrees. */
data class TransactionStyle(val icon: ImageVector, val color: Color, val amountPrefix: String)

fun transactionStyle(type: TransactionType): TransactionStyle = when (type) {
    TransactionType.DEPOSIT -> TransactionStyle(Icons.Default.ArrowDownward, IncomeGreen, "+$")
    TransactionType.WITHDRAWAL -> TransactionStyle(Icons.Default.ArrowUpward, ExpenseRed, "-$")
    // A transfer is neither income nor expense, so no +/- sign.
    TransactionType.TRANSFER -> TransactionStyle(Icons.Default.SyncAlt, TransferBlue, "$")
}

fun transactionAmountText(t: TransactionEntity): String =
    transactionStyle(t.transactionType).amountPrefix + String.format(java.util.Locale.US, "%.2f", t.amount)

fun transactionTitle(t: TransactionEntity): String {
    if (t.payee.isNotBlank()) return t.payee
    if (t.transactionType == TransactionType.WITHDRAWAL) {
        val parts = listOf(t.category, t.subCategory).filter { it.isNotBlank() }
        if (parts.isNotEmpty()) return parts.joinToString(": ")
    }
    return t.transactionType.label
}

/** "Checking" for deposits/withdrawals, "Checking → Savings" for transfers. */
fun transactionAccountText(t: TransactionEntity, accounts: List<AccountEntity>): String {
    val from = accounts.find { it.id == t.accountId }?.name ?: t.accountId
    if (t.transactionType != TransactionType.TRANSFER) return from
    val to = accounts.find { it.id == t.toAccountId }?.name ?: t.toAccountId.orEmpty()
    return if (to.isBlank()) from else "$from → $to"
}
