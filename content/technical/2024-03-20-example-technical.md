---
title: ## Bubble sort algorithm
subtitle: A look into an the bubble sort algorithm
tags: #algorithms #sorting
---
Bubble sort will sort an array by passing through the array and swapping the adjacent elements. It will keep passing through the array until all elements are in order. 
Think of it as moving along the array and always asking is my current number bigger than the next number and if it is then it will swap them but it can only swap in the same position twice in each pass. 

Notice bellow how the numbers are being ordered with each loop iteration and a single pass is 6 loop iterations for this array size. 

![number sorting](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/638vj1psl0z039ls2os1.png)

## How to implement bubble sort

First we will have a do while loop that keeps looping while the array is un sorted. 

```javascript
let keepSwopping;
    do{
        keepSwopping = false;
 }while(keepSwopping)`
```
Secondly we have a for loop within the do while that will pass through the array.


```javascript
for (let i = 0; i < length; i++) {
if (array[i] > array[i + 1]) {
 let temp = array[i];
 array[i] = array[i + 1];
 array[i + 1] = temp;
 keepSwopping = true;
                console.log(array);
            
            }
        }

```

Thirdly within the for loop we have an If statement that makes a check to see if the current element is larger than the next element in the array.

If it is larger we store the current value in temp. Then we assign the value of the next element[i+1] in the current element[i] and the value of temp in [i+1]. The value of keepSwopping is set true to keep the do while looping. 


  

```javascript
 if (array[i] > array[i + 1]) {
 let temp = array[i];
 array[i] = array[i + 1];
 array[i + 1] = temp;
 keepSwopping = true;
```





```javascript
const unSorted = [3,6,4,7,1,5]
const bubble = (array) => {
    console.log(array)
    length = array.length;
    let keepSwopping;
    do{
        keepSwopping = false;
        for (let i = 0; i < length; i++) {
            if (array[i] > array[i + 1]) {
                let temp = array[i];
                array[i] = array[i + 1];
                array[i + 1] = temp;
                keepSwopping = true;
                console.log(array);
            
            }
        }
    }while(keepSwopping)
}

bubble(unSorted)
```

## Best and worst case run time

O(n) The best case is when array has already been sorted so we only pass through the loop for the size of the array once. 

O(n² ) The worst case is when we have to loop through the array for every item.

O(1) Auxiliary Space 
