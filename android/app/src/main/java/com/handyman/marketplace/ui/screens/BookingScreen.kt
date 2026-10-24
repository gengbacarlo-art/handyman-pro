package com.handyman.marketplace.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.handyman.marketplace.network.ApiService
import com.handyman.marketplace.models.CreatePaymentRequest
import kotlinx.coroutines.launch
import com.stripe.android.PaymentConfiguration
import com.stripe.android.ViewModelFactory
import com.stripe.android.paymentlauncher.PaymentLauncher
import com.stripe.android.paymentlauncher.PaymentLauncherContract
import com.stripe.android.paymentlauncher.PaymentResult
import com.stripe.android.model.PaymentMethodCreateParams
import com.stripe.android.model.PaymentIntent
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.platform.LocalContext

@Composable
fun BookingScreen(
    navController: androidx.navigation.navController,
    apiService: ApiService,
    jobId: String
) {
    var amount by remember { mutableStateOf(0.0) }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var clientSecret by remember { mutableStateOf("") }
    val coroutineScope = rememberCoroutineScope()

    // Stripe payment launcher
    val paymentLauncher = rememberLauncherForActivityResult(
        contract = com.stripe.android.paymentlauncher.PaymentLauncherContract()
    ) { result ->
        when (result) {
            is PaymentResult.Completed -> {
                message = "Payment completed!"
                // Confirm with backend
                coroutineScope.launch {
                    val prefs = androidx.preference.PreferenceManager.getDefaultSharedPreferences(LocalContext.current)
                    val token = prefs.getString("auth_token", "") ?: ""
                    val res = apiService.confirmPayment("Bearer $token", com.handyman.marketplace.models.ConfirmPaymentRequest(
                        payment_intent_id = result.paymentIntent.id,
                        job_id = jobId.toIntOrNull() ?: 0
                    ))
                    if (res.isSuccessful) {
                        navController.navigate("client_home") { popUpTo(navController.graph.startDestination) { inclusive = true } }
                    }
                }
            }
            is PaymentResult.Canceled -> message = "Payment cancelled"
            is PaymentResult.Failed -> message = "Payment failed: ${result.error.message}"
        }
    }

    LaunchedEffect(Unit) {
        val prefs = androidx.preference.PreferenceManager.getDefaultSharedPreferences(LocalContext.current)
        val token = prefs.getString("auth_token", "") ?: ""
        coroutineScope.launch {
            val res = apiService.createPaymentIntent("Bearer $token", CreatePaymentRequest(job_id = jobId.toIntOrNull() ?: 0))
            if (res.isSuccessful) {
                clientSecret = res.body()!!.client_secret
                amount = res.body()!!.paymentIntentId.length // placeholder - in real app parse amount from job
            } else {
                message = res.errorBody?.string() ?: "Failed to create payment"
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
    ) {
        Text("Payment", style = MaterialTheme.typography.headlineLarge)
        Text(text = "Amount: \$${amount.toInt()}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 24.dp))

        if (message.isNotEmpty()) {
            Text(text = message, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 16.dp))
        }

        Button(
            onClick = {
                if (clientSecret.isNotEmpty()) {
                    // In production, use Stripe's PaymentSheet with client_secret
                    // Here we show a simplified confirmation
                    message = "Redirecting to Stripe... (configure Stripe SDK for production)"
                    loading = true
                }
            },
            enabled = !loading && clientSecret.isNotEmpty(),
            modifier = Modifier.fillMaxWidth()
        ) {
            if (loading) CircularProgressIndicator() else Text("Pay Now")
        }

        TextButton(onClick = { navController.popBackStack() }) {
            Text("Back")
        }
    }
}
