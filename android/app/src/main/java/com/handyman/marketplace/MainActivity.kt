package com.handyman.marketplace

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.material3.MaterialTheme
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.handyman.marketplace.ui.theme.HandymanTheme
import com.handyman.marketplace.ui.screens.*
import com.handyman.marketplace.network.ApiService
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {

    private val apiService: ApiService by lazy {
        val logging = HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BODY)
        val client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        Retrofit.Builder()
            .baseUrl("http://10.0.2.2:4000/api/") // Android emulator localhost
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HandymanTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController: NavHostController = rememberNavController()
                    NavHost(navController = navController, startDestination = "login") {

                        composable("login") { LoginScreen(navController, apiService) }
                        composable("register") { RegisterScreen(navController, apiService) }
                        composable("client_home") { ClientHomeScreen(navController, apiService) }
                        composable("job_detail/{jobId}") { backStackEntry ->
                            val jobId = backStackEntry.arguments?.getString("jobId") ?: ""
                            JobDetailScreen(navController, apiService, jobId)
                        }
                        composable("booking/{jobId}") { backStackEntry ->
                            val jobId = backStackEntry.arguments?.getString("jobId") ?: ""
                            BookingScreen(navController, apiService, jobId)
                        }
                        composable("review/{jobId}") { backStackEntry ->
                            val jobId = backStackEntry.arguments?.getString("jobId") ?: ""
                            // In a real app, pass handymanId and name via navigation arguments too
                            ReviewScreen(navController, apiService, jobId.toIntOrNull() ?: 0, 0, "Handyman")
                        }
                        composable("handyman_dashboard") { HandymanDashboardScreen(navController, apiService) }
                        composable("admin_dashboard") { AdminDashboardScreen(navController, apiService) }
                        composable("reviews") { ReviewsScreen(navController, apiService) }
                        composable(
                            "reviews/handyman/{handymanId}",
                            arguments = listOf(
                                navArgument("handymanName") { type = androidx.navigation.NavType.StringType }
                            )
                        ) { backStackEntry ->
                            val handymanId = backStackEntry.arguments?.getString("handymanId")?.toIntOrNull() ?: 0
                            val handymanName = backStackEntry.arguments?.getString("handymanName") ?: "Handyman"
                            ReviewsScreen(navController, apiService, handymanId, handymanName)
                        }
                    }
                }
            }
        }
    }
}
