---
title:  primer on recursion
subtitle:  a look into how recursion works
tags:  #javascriprs #computerscience
---

## Introduction 
Recursion is a concept that many people hear about but often struggle to understand or implement correctly. 
I'd like to distill some information about recursion to help deepen people's understanding

## Recursion

Recursion occurs when a function calls itself within its own body. This is known as self-invocation. 

The example below shows the exampleRecursion function calling itself. The problem with this function is it will keep calling itself indefinitely until it runs out of stack frames leading to a stack overflow error.



``` javascript 
const exampleRecursion = (n)=>{
n = n+1
exampleRecursion(n)
}

```

The stack is the part of memory where executable is added and operates on a last in last out policy. 

Every-time a function is called it is added to the top of the  stack then each line inside the function is executed and if another function is called within that function then it is added to the top of the stack to be executed. 

```javascript
const function1 = ()=> {
   // Some code here
   function2();
   // Some code here
 Return "function 1 finished"
}
const function2 = ()=> {
   return "finished";
}

// Invoke the first function
function1();

```
In the example code above the order of stack execution would be as follows:

The first function1 is added to the stack and then each line of its code is executed. 

![stack function 1](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/9nbpukdyakisu0oyycen.png)

When it reaches invoking function2 then function2 is added to the top of the stack and its lines of code are then executed.

![function2 added to top of the stack](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/r49mjny58vx1adw0nxe4.png)

When function 2 has finished being executed it is removed from the top of the stack and then the rest of function1 lines of code are finished being executed. 

![stack function 1](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/9nbpukdyakisu0oyycen.png)

Now returning to the problem with recursion is if there is no break clause within function it will keep adding to the stack. To fix this in the first example we can add the break clause to stop at n=10 


 

``` javascript 
const exampleRecursion = (n)=>{
if (n=10){
return n
}
n = n+1
exampleRecursion(n)
}

```

## Primitive recursion

A recursive function is primitive when the same functionality can be achieved using loops. For our example we could re design our exampleRecursion function as a for loop. 

```Javascript
for (let n = 0; n < 10; n++) {

}
```

In this example it is more efficient in terms of space to write the function as a for loop as the for loop only adds 1 stack frame. 


## Efficiency

Recursion can be used to write very simple code as you just need to write a single function that invokes it self. Though these implementations can be very in-efficient. Take for example the this Fibonacci sequence generator

```Javascript 

const FibRecursion = (n)=>{
    
    if (n=== 1){
    return n
    }
    if (n=== 0){
        return n
        }
    
        return FibRecursion(n-2) + FibRecursion(n-1)
    }

    FibRecursion(5)


```
To work out the big O complexity of this recursive function we can use the formula 0(bᵈ) where b is the branching factor and d is the depth.

The function would produce this call tree that has depth of 5 and a branching factor of 2. The complexity would be 0(2ⁿ)


![call tree](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/7kn77tu3196ctibl5axe.png)

If we wrote this function out using for loop iteration. This function would have a complexity of O(n) as we have a single loop of size n.

```Javascript
const fibIterator = (n)=>{
    let fib = [0, 1];
  
  
  for(let i = 2; i <= n; i++) {
    fib[i] = fib[i - 1] + fib[i - 2]; 
  }
  
  return fib;
}

```

In the next post I will cover tail recursion and using memory functions to improve performance. 





 

  

 







 


