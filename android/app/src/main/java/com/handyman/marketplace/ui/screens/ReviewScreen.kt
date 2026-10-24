package com.handyman.marketplace.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.handyman.marketplace.models.ReviewRequest
import com.handyman.marketplace.network.ApiService
import kotlinx.coroutines.launch

@Composable
fun ReviewScreen(
    navController: androidx.navigation.navController,
    apiService: ApiService,
    jobId: Int,
    handymanId: Int,
    handymanName: String
) {
    var rating by remember { mutableIntStateOf(5) }
    var comment by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    val coroutineScope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
    ) {
        Text("Review $handymanName", style = MaterialTheme.typography.headlineLarge)
        Text("How was your experience?", style = MaterialTheme.typography.bodyMedium)

        // Star rating
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            repeat(5) { star ->
                val isSelected = star < rating
                IconButton(
                    onClick = { rating = star + 1 },
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = if (isSelected) androidx.compose.material.icons.Icons.Default.Star else androidx.compose.material.icons.Icons.Default.StarOutline,
                        contentDescription = "Star $star",
                        tint = if (isSelected) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        OutlinedTextField(
            value = comment,
            onValueChange = { comment = it },
            label = { Text("Comments (optional)") },
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            maxLines = 3
        )

        if (message.isNotEmpty()) {
            Text(text = message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 8.dp))
        }

        Button(
            onClick = {
                coroutineScope.launch {
                    loading = true
                    try {
                        val prefs = LocalContext.current.getSharedPreferences("handyman_prefs", android.content.Context.MODE_PRIVATE)
                        val token = prefs.getString("auth_token", "") ?: ""
                        val res = apiService.createReview("Bearer $token", ReviewRequest(
                            job_id = jobId,
                            rating = rating,
                            comment = comment.takeIf { it.isNotEmpty() }
                        ))
                        if (res.isSuccessful) {
                            message = "Review submitted! Thank you."
                            navController.popBackStack()
                        } else {
                            message = res.errorBody?.string() ?: "Failed to submit review"
                        }
                    } catch (e: Exception) {
                        message = e.message ?: "Failed to submit review"
                    } finally {
                        loading = false
                    }
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (loading) CircularProgressIndicator() else Text("Submit Review")
        }

        TextButton(onClick = { navController.popBackStack() }) {
            Text("Skip")
        }
    }
}
