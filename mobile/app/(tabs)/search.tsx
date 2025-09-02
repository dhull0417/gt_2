import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native'
import React from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

const TRENDING_TOPICS = [
    {topic: "Example 1", tweets: "50K"},
    {topic: "Example 2", tweets: "100K"},
    {topic: "Example 3", tweets: "150K"},
    {topic: "Example 4", tweets: "200K"},
    {topic: "Example 5", tweets: "250K"},
    {topic: "Example 6", tweets: "250K"},
    {topic: "Example 7", tweets: "250K"},
    {topic: "Example 8", tweets: "250K"},
    {topic: "Example 9", tweets: "250K"},
    {topic: "Example 10", tweets: "250K"},
]

const SearchScreen = () => {
  return (
    <SafeAreaView className="flex-1 bg-white">
        {/* HEADER */}
        <View className="px-4 py-3 border-b border-gray-100">
            <View className="flex-row items-center bg-gray-100 rounded-full px-4 py-3">
                <Feather name="search" color="#657786"/>
                <TextInput
                    placeholder='Search Twitter'
                    className='flex-1 ml-3 text-base'
                    placeholderTextColor="#657786"
                />
            </View>
        </View>

        <ScrollView className='flex-1'>
            <View className='p-4'>
                <Text className='text-xl font-bold text-gray-900 mb-4'>
                    Trending for you
                </Text>
                {TRENDING_TOPICS.map((_item, index) => (
                    <TouchableOpacity key={index} className='py-3 border-b border-gray-100'>
                        <Text className="text-gray-500 text-sm">Trending in Technology</Text>
                        <Text className="font-bold text-gray-900 text-lg">{_item.topic}</Text>
                        <Text className="text-gray-500 text-sm">{_item.tweets} Tweets</Text>
                    </TouchableOpacity>
                ))}

            </View>
        </ScrollView>
    </SafeAreaView>
  )
}

export default SearchScreen